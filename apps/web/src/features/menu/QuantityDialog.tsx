import { formatQuantity, type MenuProductEntry } from '@hf/shared';
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
import { PRODUCT_UNIT_LABELS } from '../shopping/productForm.ts';
import { parseQuantityField } from '../shopping/shoppingForm.ts';
import { useUpdateMenuEntry } from './api.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: MenuProductEntry | undefined;
}

/** Нова кількість продукту в прийомі їжі дня. На телефоні — шторка знизу. */
export function QuantityDialog({ open, onOpenChange, entry }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && entry && (
          <QuantityForm key={entry.id} entry={entry} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuantityForm({ entry, onDone }: { entry: MenuProductEntry; onDone: () => void }) {
  const update = useUpdateMenuEntry();
  const [quantity, setQuantity] = useState(formatQuantity(entry.quantityMilli));
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseQuantityField(quantity);
    setError(typeof parsed === 'string' ? parsed : undefined);
    if (typeof parsed === 'string') return;
    update.mutate({ id: entry.id, quantityMilli: parsed }, { onSuccess: onDone });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>Змінити кількість</DialogTitle>
        <DialogDescription>{entry.name}</DialogDescription>
      </DialogHeader>
      <Field label={`Кількість, ${PRODUCT_UNIT_LABELS[entry.unit]}`} error={error}>
        <Input
          inputMode="decimal"
          value={quantity}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Field>
      <ErrorText>{update.isError && errorMessage(update.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" className="max-sm:h-10">
            Скасувати
          </Button>
        </DialogClose>
        <Button type="submit" className="max-sm:h-10" disabled={update.isPending}>
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
