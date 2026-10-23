import {
  PRODUCT_UNITS,
  type ProductUnit,
  type ShoppingList,
  type ShoppingListItem,
} from '@hf/shared';
import { ArrowLeft, Pencil, Printer } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { cn } from '../../shared/lib/utils.ts';
import { useMediaQuery, WIDE_SCREEN } from '../../shared/lib/useMediaQuery.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Field, Muted } from '../../shared/ui/controls.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import {
  useAddShoppingListItem,
  useDeleteShoppingList,
  useDeleteShoppingListItem,
  useProducts,
  useShoppingList,
  useUpdateShoppingListItem,
} from './api.ts';
import { ItemDialog } from './ItemDialog.tsx';
import { ListNameDialog } from './ListNameDialog.tsx';
import { PRODUCT_UNIT_LABELS, formatUnitPrice, parseUnitPrice } from './productForm.ts';
import {
  deviationLabel,
  emptyAddItemValues,
  matchProduct,
  moneyOrDash,
  priceText,
  quantityLabel,
  toAddItemInput,
  type AddItemErrors,
} from './shoppingForm.ts';

export function ShoppingListPage() {
  const { id = '' } = useParams();
  const list = useShoppingList(id);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        to="/shopping"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Усі списки
      </Link>
      <ErrorText>{list.isError && errorMessage(list.error)}</ErrorText>
      {list.isPending && <Muted>Завантаження…</Muted>}
      {list.data && <ListContent list={list.data} />}
    </div>
  );
}

function ListContent({ list }: { list: ShoppingList }) {
  const navigate = useNavigate();
  const remove = useDeleteShoppingList();
  const removeItem = useDeleteShoppingListItem(list.id);
  const update = useUpdateShoppingListItem(list.id);
  const [renaming, setRenaming] = useState(false);
  // Рядок зберігається й після закриття, щоб вміст вікна не змінювався під час анімації.
  const [editing, setEditing] = useState<{ open: boolean; item?: ShoppingListItem }>({
    open: false,
  });
  const mutationError = [remove, removeItem, update].find((m) => m.isError)?.error;

  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="font-heading text-xl font-semibold">{list.name}</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Перейменувати список"
          title="Перейменувати список"
          onClick={() => setRenaming(true)}
        >
          <Pencil />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/shopping/${list.id}/print`}>
              <Printer />
              Друк і PDF
            </Link>
          </Button>
          <ConfirmButton
            title={`Видалити список «${list.name}»?`}
            description="Куплені в ньому продукти зникнуть з історії цін і аналітики."
            disabled={remove.isPending}
            onConfirm={() => remove.mutate(list.id, { onSuccess: () => navigate('/shopping') })}
          />
        </div>
      </div>

      <AddItemForm list={list} />
      <ErrorText>{mutationError && errorMessage(mutationError)}</ErrorText>

      {list.items.length === 0 ? (
        <Muted>Список порожній. Додайте продукт з довідника або введіть нову назву.</Muted>
      ) : (
        <ul className="divide-y text-sm">
          {list.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              currency={list.currency}
              disabled={update.isPending || removeItem.isPending}
              onUpdate={(input, onSettled) =>
                update.mutate({ itemId: item.id, input }, { onSettled })
              }
              onEdit={() => setEditing({ open: true, item })}
              onRemove={() => removeItem.mutate(item.id)}
            />
          ))}
        </ul>
      )}

      <Totals list={list} />

      <ListNameDialog open={renaming} onOpenChange={setRenaming} list={list} />
      <ItemDialog
        listId={list.id}
        currency={list.currency}
        open={editing.open}
        onOpenChange={(open) => setEditing({ ...editing, open })}
        item={editing.item}
      />
    </>
  );
}

const PRODUCTS_DATALIST = 'shopping-products';

/** Додавання продукту: з довідника за назвою або новий з одиницею й ціною. */
function AddItemForm({ list }: { list: ShoppingList }) {
  const products = useProducts();
  const add = useAddShoppingListItem(list.id);
  const [values, setValues] = useState(emptyAddItemValues);
  const [errors, setErrors] = useState<AddItemErrors>({});
  const known = matchProduct(values.name, products.data ?? []);
  const isNew = values.name.trim() !== '' && !known;
  const unit = known?.unit ?? values.unit;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toAddItemInput(values, products.data ?? [], list.currency);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    add.mutate(result.input, { onSuccess: () => setValues(emptyAddItemValues) });
  }

  return (
    <form
      className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_auto]"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Додати продукт у список"
    >
      <Field label="Продукт" error={errors.name}>
        <Input
          list={PRODUCTS_DATALIST}
          // Chrome малює стрілку випадного списку в полі з підказками; це поле вводу, не вибір.
          className="[&::-webkit-calendar-picker-indicator]:hidden"
          autoComplete="off"
          value={values.name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </Field>
      <datalist id={PRODUCTS_DATALIST}>
        {products.data?.map((product) => (
          <option key={product.id} value={product.name}>
            {formatUnitPrice(product)}
          </option>
        ))}
      </datalist>
      <Field label={`Кількість, ${PRODUCT_UNIT_LABELS[unit]}`} error={errors.quantity}>
        <Input
          inputMode="decimal"
          value={values.quantity}
          aria-invalid={errors.quantity ? true : undefined}
          onChange={(e) => setValues({ ...values, quantity: e.target.value })}
        />
      </Field>
      <Button type="submit" className="self-end" disabled={add.isPending}>
        Додати
      </Button>

      {isNew && (
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <p className="col-span-2 text-xs text-muted-foreground">
            Нового продукту немає в довіднику — він додасться туди з цією одиницею й ціною.
          </p>
          <Field label="Одиниця">
            <SelectField<ProductUnit>
              value={values.unit}
              onChange={(next) => setValues({ ...values, unit: next })}
              options={PRODUCT_UNITS.map((value) => ({
                value,
                label: PRODUCT_UNIT_LABELS[value],
              }))}
            />
          </Field>
          <Field
            label={`Ціна за ${PRODUCT_UNIT_LABELS[values.unit]}, ${list.currency}`}
            error={errors.price}
          >
            <Input
              inputMode="decimal"
              placeholder="необовʼязково"
              value={values.price}
              aria-invalid={errors.price ? true : undefined}
              onChange={(e) => setValues({ ...values, price: e.target.value })}
            />
          </Field>
        </div>
      )}
      <div className="sm:col-span-3">
        <ErrorText>{add.isError && errorMessage(add.error)}</ErrorText>
      </div>
    </form>
  );
}

interface ItemRowProps {
  item: ShoppingListItem;
  currency: string;
  disabled: boolean;
  onUpdate: (
    input: { isBought?: boolean; actualUnitPrice?: number | null },
    onSettled?: () => void,
  ) => void;
  onEdit: () => void;
  onRemove: () => void;
}

function ItemRow({ item, currency, disabled, onUpdate, onEdit, onRemove }: ItemRowProps) {
  const unit = PRODUCT_UNIT_LABELS[item.unit];
  const isWide = useMediaQuery(WIDE_SCREEN);
  const checkboxId = useId();
  // Поки зміна йде на сервер, прапорець уже показує нове значення.
  const [pendingBought, setPendingBought] = useState<boolean | null>(null);
  const isBought = pendingBought ?? item.isBought;

  const checkbox = (
    <input
      id={checkboxId}
      type="checkbox"
      className="size-4 shrink-0 accent-primary"
      checked={isBought}
      disabled={disabled}
      aria-label={`Куплено «${item.name}»`}
      onChange={(e) => {
        setPendingBought(e.target.checked);
        onUpdate({ isBought: e.target.checked }, () => setPendingBought(null));
      }}
    />
  );
  const name = (
    <label htmlFor={checkboxId} className="min-w-0 cursor-pointer">
      <span className={cn('block font-medium break-words', isBought && 'line-through')}>
        {item.name}
      </span>
      <span className="block text-muted-foreground">
        {quantityLabel(item)}
        {item.expectedUnitPrice !== null && (
          <>
            {' '}
            · {moneyOrDash(item.expectedUnitPrice, currency)} / {unit}
          </>
        )}
      </span>
    </label>
  );
  const priceInput = (
    <ActualPriceInput
      // Нове значення з сервера скидає введений текст.
      key={`${item.id}:${item.actualUnitPrice}`}
      item={item}
      currency={currency}
      disabled={disabled}
      onCommit={(actualUnitPrice) => onUpdate({ actualUnitPrice })}
    />
  );
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Змінити «${item.name}»`}
        title={`Змінити «${item.name}»`}
        onClick={onEdit}
      >
        <Pencil />
      </Button>
      <ConfirmButton
        title={`Прибрати «${item.name}» зі списку?`}
        label="Прибрати"
        disabled={disabled}
        onConfirm={onRemove}
      />
    </div>
  );

  if (!isWide) {
    // Телефон у магазині: галочка, назва й поле ціни в першому рядку, суми й дії — під назвою.
    return (
      <li
        data-testid="shopping-item"
        className={cn('flex items-start gap-3 py-2', isBought && 'opacity-60')}
      >
        <div className="flex h-9 items-center">{checkbox}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {name}
            {priceInput}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap gap-x-3 tabular-nums">
              <span data-testid="item-expected">
                <span className="text-muted-foreground">Очікувано </span>
                {moneyOrDash(item.expectedTotal, currency)}
              </span>
              <span data-testid="item-actual">
                <span className="text-muted-foreground">Фактично </span>
                {moneyOrDash(item.actualTotal, currency)}
              </span>
            </div>
            <div className="-my-1 -mr-1">{actions}</div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      data-testid="shopping-item"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 py-2', isBought && 'opacity-60')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {checkbox}
        {name}
      </div>

      <div className="text-right tabular-nums" data-testid="item-expected">
        <span className="block text-xs text-muted-foreground">Очікувано</span>
        {moneyOrDash(item.expectedTotal, currency)}
      </div>
      <div className="flex items-center gap-2">
        {priceInput}
        <div className="w-24 text-right tabular-nums" data-testid="item-actual">
          <span className="block text-xs text-muted-foreground">Фактично</span>
          {moneyOrDash(item.actualTotal, currency)}
        </div>
      </div>
      {actions}
    </li>
  );
}

/** Фактична ціна за одиницю; зберігається, коли поле втрачає фокус або натиснуто Enter. */
function ActualPriceInput({
  item,
  currency,
  disabled,
  onCommit,
}: {
  item: ShoppingListItem;
  currency: string;
  disabled: boolean;
  onCommit: (price: number | null) => void;
}) {
  const [text, setText] = useState(() => priceText(item.actualUnitPrice, currency));
  const [error, setError] = useState<string>();

  function commit() {
    const price = parseUnitPrice(text, currency);
    if (typeof price === 'string') {
      setError(price);
      return;
    }
    setError(undefined);
    if (price !== item.actualUnitPrice) onCommit(price);
  }

  return (
    <Input
      className="w-24 text-right"
      inputMode="decimal"
      aria-label={`Фактична ціна «${item.name}» за ${PRODUCT_UNIT_LABELS[item.unit]}`}
      title={error ?? `Фактична ціна за ${PRODUCT_UNIT_LABELS[item.unit]}`}
      placeholder={priceText(item.expectedUnitPrice, currency) || 'ціна'}
      value={text}
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function Totals({ list }: { list: ShoppingList }) {
  const { totals, currency } = list;
  const money = (amountMinor: number) => moneyOrDash(amountMinor, currency);
  const rows: [string, string][] = [
    ['Очікувано за весь список', money(totals.expected)],
    [`Куплено (${totals.boughtCount} з ${totals.itemCount}) фактично`, money(totals.actual)],
    ['Залишилось купити на', money(totals.remaining)],
    ['Відхилення від очікуваних цін', deviationLabel(totals.deviation, currency)],
  ];
  return (
    <div className="space-y-1">
      <dl
        className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4"
        data-testid="shopping-totals"
      >
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 sm:block">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
              className={cn(
                'font-medium tabular-nums',
                label.startsWith('Відхилення') && totals.deviation > 0 && 'text-destructive',
                label.startsWith('Відхилення') && totals.deviation < 0 && 'text-emerald-600',
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {totals.unpricedCount > 0 && (
        <Muted>
          Без очікуваної ціни: {totals.unpricedCount}. Їх немає в очікуваних сумах і відхиленні.
        </Muted>
      )}
    </div>
  );
}
