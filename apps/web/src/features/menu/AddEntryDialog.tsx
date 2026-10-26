import { formatMoney, type MealType, type Product } from '@hf/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field, Muted } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useProducts } from '../shopping/api.ts';
import { PRODUCT_UNIT_LABELS, formatUnitPrice } from '../shopping/productForm.ts';
import { parseQuantityField } from '../shopping/shoppingForm.ts';
import { useAddMenuEntry, useDishes } from './api.ts';
import { dayTitle, parseServingsField } from './calendar.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealType?: MealType | undefined;
}

type EntryKind = 'dish' | 'product';

const KINDS: { kind: EntryKind; label: string }[] = [
  { kind: 'dish', label: 'Страва' },
  { kind: 'product', label: 'Продукт' },
];

/**
 * Страва з порціями або продукт з кількістю для прийому їжі дня; обидва — з довідників.
 * На телефоні — шторка знизу.
 */
export function AddEntryDialog({ open, onOpenChange, date, mealType }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && mealType && (
          <AddEntryForm date={date} mealType={mealType} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddEntryForm({
  date,
  mealType,
  onDone,
}: {
  date: string;
  mealType: MealType;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<EntryKind>('dish');

  const header = (
    <>
      <DialogHeader>
        <DialogTitle>Додати в меню</DialogTitle>
        <DialogDescription>
          {mealType.name}, {dayTitle(date)}
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-1" role="group" aria-label="Що додати">
        {KINDS.map((option) => (
          <Button
            key={option.kind}
            type="button"
            variant={option.kind === kind ? 'default' : 'outline'}
            className="max-sm:h-10"
            aria-pressed={option.kind === kind}
            onClick={() => setKind(option.kind)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </>
  );

  const props = { date, mealType, header, onDone };
  return kind === 'dish' ? <DishForm {...props} /> : <ProductForm {...props} />;
}

interface FormProps {
  date: string;
  mealType: MealType;
  header: ReactNode;
  onDone: () => void;
}

function FormFooter({ pending }: { pending: boolean }) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline" className="max-sm:h-10">
          Скасувати
        </Button>
      </DialogClose>
      <Button type="submit" className="max-sm:h-10" disabled={pending}>
        Додати
      </Button>
    </DialogFooter>
  );
}

function DishForm({ date, mealType, header, onDone }: FormProps) {
  const dishes = useDishes();
  const add = useAddMenuEntry();
  const [dishId, setDishId] = useState('');
  const [servings, setServings] = useState('1');
  const [errors, setErrors] = useState<{ dish?: string; servings?: string }>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseServingsField(servings);
    const next = {
      dish: dishId === '' ? 'Виберіть страву' : undefined,
      servings: typeof parsed === 'string' ? parsed : undefined,
    };
    setErrors(next);
    if (next.dish || typeof parsed === 'string') return;
    add.mutate({ date, mealTypeId: mealType.id, dishId, servings: parsed }, { onSuccess: onDone });
  }

  if (dishes.data?.length === 0) {
    return (
      <div className="grid gap-4">
        {header}
        <Muted>
          У довіднику ще немає страв.{' '}
          <Link className="text-primary underline" to="/menu/dictionaries">
            Додати страви в довідниках
          </Link>
        </Muted>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      {header}
      <ErrorText>{dishes.isError && errorMessage(dishes.error)}</ErrorText>
      <Field label="Страва" error={errors.dish}>
        <SelectField
          value={dishId}
          onChange={setDishId}
          placeholder={dishes.isPending ? 'Завантаження…' : 'Виберіть страву'}
          invalid={Boolean(errors.dish)}
          options={(dishes.data ?? []).map((dish) => ({
            value: dish.id,
            label: `${dish.name} — ${formatMoney({ amountMinor: dish.portionPrice, currency: dish.currency })}${dish.isPriceComplete ? '' : ' (ціна неповна)'}`,
          }))}
        />
      </Field>
      <Field label="Порції" error={errors.servings}>
        <Input
          inputMode="numeric"
          value={servings}
          aria-invalid={errors.servings ? true : undefined}
          onChange={(e) => setServings(e.target.value)}
        />
      </Field>
      <ErrorText>{add.isError && errorMessage(add.error)}</ErrorText>
      <FormFooter pending={add.isPending} />
    </form>
  );
}

/** «Молоко — 42,00 ₴ / л» або «Сіль — немає ціни». */
const productOptionLabel = (product: Product) =>
  `${product.name} — ${product.price === null ? 'немає ціни' : formatUnitPrice(product)}`;

function ProductForm({ date, mealType, header, onDone }: FormProps) {
  // Лише неархівні продукти довідника; новий продукт — на сторінці «Продукти».
  const products = useProducts();
  const add = useAddMenuEntry();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [errors, setErrors] = useState<{ product?: string; quantity?: string }>({});
  const selected = products.data?.find((product) => product.id === productId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseQuantityField(quantity);
    const next = {
      product: productId === '' ? 'Виберіть продукт' : undefined,
      quantity: typeof parsed === 'string' ? parsed : undefined,
    };
    setErrors(next);
    if (next.product || typeof parsed === 'string') return;
    add.mutate(
      { date, mealTypeId: mealType.id, productId, quantityMilli: parsed },
      { onSuccess: onDone },
    );
  }

  if (products.data?.length === 0) {
    return (
      <div className="grid gap-4">
        {header}
        <Muted>
          У довіднику ще немає продуктів.{' '}
          <Link className="text-primary underline" to="/menu/products">
            Додати продукти
          </Link>
        </Muted>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      {header}
      <ErrorText>{products.isError && errorMessage(products.error)}</ErrorText>
      <Field label="Продукт" error={errors.product}>
        <SelectField
          value={productId}
          onChange={setProductId}
          placeholder={products.isPending ? 'Завантаження…' : 'Виберіть продукт'}
          invalid={Boolean(errors.product)}
          options={(products.data ?? []).map((product) => ({
            value: product.id,
            label: productOptionLabel(product),
          }))}
        />
      </Field>
      <Field
        label={selected ? `Кількість, ${PRODUCT_UNIT_LABELS[selected.unit]}` : 'Кількість'}
        error={errors.quantity}
      >
        <Input
          inputMode="decimal"
          value={quantity}
          aria-invalid={errors.quantity ? true : undefined}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Field>
      <ErrorText>{add.isError && errorMessage(add.error)}</ErrorText>
      <FormFooter pending={add.isPending} />
    </form>
  );
}
