import { formatMoney, type Dish, type Product } from '@hf/shared';
import { Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/select.tsx';
import { useProducts } from '../shopping/api.ts';
import { PRODUCT_UNIT_LABELS } from '../shopping/productForm.ts';
import { useDish, useSaveDish } from './api.ts';
import {
  dishFormValues,
  emptyDishLine,
  previewDish,
  productOptions,
  toDishInput,
  type DishFormErrors,
  type DishFormValues,
  type DishLineValues,
} from './dishForm.ts';
import { IncompletePriceBadge } from './IncompletePriceBadge.tsx';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id страви для зміни; без нього форма створює нову. */
  dishId?: string | undefined;
}

/** Назва страви й склад однієї порції з продуктів довідника. */
export function DishDialog({ open, onOpenChange, dishId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && <DishLoader dishId={dishId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function DishLoader({ dishId, onDone }: { dishId?: string | undefined; onDone: () => void }) {
  const dish = useDish(dishId);
  // Разом з архівними: архівний продукт, що вже є в складі, має назву й ціну.
  const products = useProducts(true);
  const error = (dishId && dish.isError && dish.error) || (products.isError && products.error);

  if (error) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Страва</DialogTitle>
        </DialogHeader>
        <ErrorText>{errorMessage(error)}</ErrorText>
      </>
    );
  }
  if ((dishId && !dish.data) || !products.data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Страва</DialogTitle>
        </DialogHeader>
        <Muted>Завантаження…</Muted>
      </>
    );
  }
  // Форма монтується, коли дані вже є, тож починається з актуальних значень.
  return (
    <DishForm dish={dishId ? dish.data : undefined} products={products.data} onDone={onDone} />
  );
}

function DishForm({
  dish,
  products,
  onDone,
}: {
  dish?: Dish | undefined;
  products: Product[];
  onDone: () => void;
}) {
  const save = useSaveDish();
  const [values, setValues] = useState<DishFormValues>(() => dishFormValues(dish));
  const [errors, setErrors] = useState<DishFormErrors>({ lines: {} });
  const preview = previewDish(values, products);
  const hasActiveProducts = products.some((product) => !product.isArchived);
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: 'UAH' });

  const updateLine = (key: string, patch: Partial<DishLineValues>) =>
    setValues({
      ...values,
      lines: values.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toDishInput(values);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({ lines: {} });
    save.mutate(dish ? { id: dish.id, input: result.input } : { input: result.input }, {
      onSuccess: onDone,
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{dish ? `Змінити «${dish.name}»` : 'Нова страва'}</DialogTitle>
        <DialogDescription>
          Склад однієї порції. Ціна рахується за поточними цінами продуктів.
        </DialogDescription>
      </DialogHeader>
      <Field label="Назва" error={errors.name}>
        <Input
          autoFocus
          value={values.name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium">Склад порції</legend>
        {values.lines.length === 0 && <Muted>Склад не задано.</Muted>}
        {values.lines.length > 0 && (
          <ul className="grid gap-3">
            {values.lines.map((line, index) => {
              const linePreview = preview.lines[index];
              const product = linePreview?.product;
              const lineErrors = errors.lines[line.key] ?? {};
              const number = index + 1;
              return (
                <li
                  key={line.key}
                  data-testid="dish-line"
                  className="grid gap-2 sm:flex sm:items-start"
                >
                  <div className="grid min-w-0 gap-1 sm:flex-1">
                    <Select
                      value={line.productId}
                      onValueChange={(productId) => updateLine(line.key, { productId })}
                    >
                      <SelectTrigger
                        className="w-full max-sm:h-10"
                        aria-label={`Продукт ${number}`}
                        aria-invalid={lineErrors.product ? true : undefined}
                      >
                        <SelectValue placeholder="Виберіть продукт" />
                      </SelectTrigger>
                      <SelectContent>
                        {productOptions(values, line.key, products).map((option) => (
                          <SelectItem
                            key={option.product.id}
                            value={option.product.id}
                            disabled={option.disabled}
                          >
                            {option.product.name}
                            {option.product.isArchived && ' (в архіві)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {lineErrors.product && (
                      <span className="text-destructive">{lineErrors.product}</span>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 gap-1 sm:w-32 sm:flex-none">
                      <div className="flex items-center gap-1.5">
                        <Input
                          inputMode="decimal"
                          placeholder="0,15"
                          value={line.quantity}
                          aria-label={`Кількість ${number}`}
                          aria-invalid={lineErrors.quantity ? true : undefined}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        />
                        <span className="w-6 shrink-0 text-muted-foreground">
                          {product ? PRODUCT_UNIT_LABELS[product.unit] : ''}
                        </span>
                      </div>
                      {lineErrors.quantity && (
                        <span className="text-destructive">{lineErrors.quantity}</span>
                      )}
                    </div>
                    <span
                      className="w-20 shrink-0 py-2 text-right tabular-nums max-sm:py-2.5 sm:py-1.5"
                      data-testid="dish-line-total"
                    >
                      {linePreview?.total == null ? '—' : money(linePreview.total)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 max-sm:size-10"
                      aria-label={`Прибрати продукт ${number}`}
                      title="Прибрати"
                      onClick={() =>
                        setValues({
                          ...values,
                          lines: values.lines.filter((other) => other.key !== line.key),
                        })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hasActiveProducts || values.lines.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => setValues({ ...values, lines: [...values.lines, emptyDishLine()] })}
          >
            <Plus />
            Додати продукт
          </Button>
        ) : (
          <Muted>
            У довіднику ще немає продуктів.{' '}
            <Link className="underline" to="/shopping/products">
              Додайте їх на сторінці «Продукти»
            </Link>
            .
          </Muted>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="font-medium">Ціна порції</span>
        <span className="flex items-center gap-2">
          {!preview.portion.isPriceComplete && (
            <IncompletePriceBadge unpricedCount={preview.portion.unpricedCount} />
          )}
          <span className="font-medium tabular-nums" data-testid="dish-portion-price">
            {money(preview.portion.price)}
          </span>
        </span>
      </div>

      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {dish ? 'Зберегти' : 'Додати'}
        </Button>
      </DialogFooter>
    </form>
  );
}
