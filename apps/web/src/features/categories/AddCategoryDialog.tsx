import { createCategorySchema, type CategoryKind } from '@hf/shared';
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
  DialogTrigger,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS, useCreateCategory } from './api.ts';

/** Кнопка «Додати категорію» з формою створення в модальному вікні. */
export function AddCategoryDialog() {
  const create = useCreateCategory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [nameError, setNameError] = useState<string>();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Назва й помилки скидаються, а тип лишається: категорії зручно додавати серіями.
      setName('');
      setNameError(undefined);
      create.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createCategorySchema.safeParse({ name, kind });
    if (!parsed.success) {
      setNameError('Вкажіть назву до 100 символів');
      return;
    }
    setNameError(undefined);
    create.mutate(parsed.data, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Додати категорію</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Нова категорія</DialogTitle>
            <DialogDescription>
              Категорія витрат доступна лише для витрат, категорія доходів — лише для доходів.
            </DialogDescription>
          </DialogHeader>
          <Field label="Назва" error={nameError}>
            <Input
              autoFocus
              value={name}
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Тип">
            <SelectField
              value={kind}
              onChange={setKind}
              options={CATEGORY_KINDS.map((value) => ({
                value,
                label: CATEGORY_KIND_LABELS[value],
              }))}
            />
          </Field>
          <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Скасувати</Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              Додати
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
