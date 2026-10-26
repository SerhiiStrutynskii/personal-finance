import type { MealType } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useSaveMealType } from './api.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Прийом їжі для перейменування; без нього форма створює новий. */
  mealType?: MealType | undefined;
  /** Прийоми їжі довідника в їхньому порядку: з них обирається місце нового запису. */
  mealTypes: readonly MealType[];
}

/** Назва нового прийому їжі або перейменування наявного. */
export function MealTypeDialog({ open, onOpenChange, mealType, mealTypes }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <MealTypeForm
            mealType={mealType}
            mealTypes={mealTypes}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MealTypeForm({
  mealType,
  mealTypes,
  onDone,
}: {
  mealType?: MealType | undefined;
  mealTypes: readonly MealType[];
  onDone: () => void;
}) {
  const save = useSaveMealType();
  const [name, setName] = useState(mealType?.name ?? '');
  // Місце обирається лише для нового запису; за замовчуванням — після останнього, тобто в кінці.
  const showAfter = !mealType && mealTypes.length > 0;
  const [afterId, setAfterId] = useState(mealTypes.at(-1)?.id ?? '');
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 100) {
      setError('Вкажіть назву до 100 символів');
      return;
    }
    setError(undefined);
    save.mutate(
      { id: mealType?.id, name: trimmed, afterId: showAfter ? afterId : undefined },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{mealType ? 'Перейменувати прийом їжі' : 'Новий прийом їжі'}</DialogTitle>
      </DialogHeader>
      <Field label="Назва" error={error}>
        <Input
          autoFocus
          value={name}
          placeholder="Наприклад, «Перекус»"
          aria-invalid={error ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      {showAfter && (
        <Field label="Після">
          <SelectField
            value={afterId}
            onChange={setAfterId}
            options={mealTypes.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Field>
      )}
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {mealType ? 'Зберегти' : 'Додати'}
        </Button>
      </DialogFooter>
    </form>
  );
}
