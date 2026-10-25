import { formatMoney, type MealType } from '@hf/shared';
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
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useAddMenuEntry, useDishes } from './api.ts';
import { dayTitle, parseServingsField } from './calendar.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealType?: MealType | undefined;
}

/** Страва з довідника й кількість порцій для прийому їжі дня. На телефоні — шторка знизу. */
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

  const header = (
    <DialogHeader>
      <DialogTitle>Додати страву</DialogTitle>
      <DialogDescription>
        {mealType.name}, {dayTitle(date)}
      </DialogDescription>
    </DialogHeader>
  );

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
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" className="max-sm:h-10">
            Скасувати
          </Button>
        </DialogClose>
        <Button type="submit" className="max-sm:h-10" disabled={add.isPending}>
          Додати
        </Button>
      </DialogFooter>
    </form>
  );
}
