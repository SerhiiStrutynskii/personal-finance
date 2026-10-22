import { DEFAULT_CURRENCY, PRODUCT_UNITS, type Product, type ProductUnit } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
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
import { useSaveProduct } from './api.ts';
import {
  PRODUCT_UNIT_LABELS,
  productFormValues,
  toProductInput,
  type ProductFormErrors,
} from './productForm.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Продукт для зміни; без нього форма створює новий. */
  product?: Product | undefined;
}

export function ProductDialog({ open, onOpenChange, product }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Форма монтується при кожному відкритті, тож починається з актуальних значень. */}
        {open && <ProductForm product={product} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ product, onDone }: { product?: Product | undefined; onDone: () => void }) {
  const save = useSaveProduct();
  const currency = product?.currency ?? DEFAULT_CURRENCY;
  const [values, setValues] = useState(() => productFormValues(product));
  const [errors, setErrors] = useState<ProductFormErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toProductInput(values, currency);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(product ? { id: product.id, input: result.input } : { input: result.input }, {
      onSuccess: onDone,
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{product ? `Змінити «${product.name}»` : 'Новий продукт'}</DialogTitle>
        <DialogDescription>
          Ціна за одиницю стане очікуваною ціною, коли продукт додадуть у список покупок.
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Одиниця">
          <SelectField<ProductUnit>
            value={values.unit}
            onChange={(unit) => setValues({ ...values, unit })}
            options={PRODUCT_UNITS.map((unit) => ({
              value: unit,
              label: PRODUCT_UNIT_LABELS[unit],
            }))}
          />
        </Field>
        <Field
          label={`Ціна за ${PRODUCT_UNIT_LABELS[values.unit]}, ${currency}`}
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
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {product ? 'Зберегти' : 'Додати'}
        </Button>
      </DialogFooter>
    </form>
  );
}
