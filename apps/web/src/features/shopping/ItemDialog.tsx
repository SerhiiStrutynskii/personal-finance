import type { ShoppingListItem } from '@hf/shared';
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
import { useUpdateShoppingListItem } from './api.ts';
import { PRODUCT_UNIT_LABELS } from './productForm.ts';
import { itemFormValues, toItemInput, type ItemErrors } from './shoppingForm.ts';

interface Props {
  listId: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ShoppingListItem | undefined;
}

/** Кількість і очікувана ціна рядка списку. */
export function ItemDialog({ listId, currency, open, onOpenChange, item }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && item && (
          <ItemForm
            listId={listId}
            currency={currency}
            item={item}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  listId,
  currency,
  item,
  onDone,
}: {
  listId: string;
  currency: string;
  item: ShoppingListItem;
  onDone: () => void;
}) {
  const update = useUpdateShoppingListItem(listId);
  const [values, setValues] = useState(() => itemFormValues(item, currency));
  const [errors, setErrors] = useState<ItemErrors>({});
  const unit = PRODUCT_UNIT_LABELS[item.unit];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toItemInput(values, currency);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    update.mutate({ itemId: item.id, input: result.input }, { onSuccess: onDone });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{`Змінити «${item.name}»`}</DialogTitle>
        <DialogDescription>
          Очікувана ціна діє лише в цьому списку; ціна в довіднику не змінюється.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <Field label={`Кількість, ${unit}`} error={errors.quantity}>
          <Input
            autoFocus
            inputMode="decimal"
            value={values.quantity}
            aria-invalid={errors.quantity ? true : undefined}
            onChange={(e) => setValues({ ...values, quantity: e.target.value })}
          />
        </Field>
        <Field label={`Очікувана ціна за ${unit}, ${currency}`} error={errors.expectedPrice}>
          <Input
            inputMode="decimal"
            placeholder="невідома"
            value={values.expectedPrice}
            aria-invalid={errors.expectedPrice ? true : undefined}
            onChange={(e) => setValues({ ...values, expectedPrice: e.target.value })}
          />
        </Field>
      </div>
      <ErrorText>{update.isError && errorMessage(update.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={update.isPending}>
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
