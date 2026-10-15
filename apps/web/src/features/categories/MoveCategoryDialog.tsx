import type { Category } from '@hf/shared';
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
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useUpdateCategory } from './api.ts';
import { parentCandidates } from './tree.ts';

interface Props {
  category: Category;
  categories: readonly Category[];
}

/** Кнопка «Перенести»: категорія стає підкатегорією іншої або окремою; історія лишається. */
export function MoveCategoryDialog({ category, categories }: Props) {
  const update = useUpdateCategory();
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState(category.parentId ?? '');
  const parents = parentCandidates(categories, category.kind, category.id);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setParentId(category.parentId ?? '');
      update.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (parentId === (category.parentId ?? '')) {
      setOpen(false);
      return;
    }
    update.mutate(
      { id: category.id, input: { parentId: parentId || null } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost">Перенести</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Перенести «{category.name}»</DialogTitle>
            <DialogDescription>
              Транзакції лишаються на цій категорії, тож історія не губиться.
            </DialogDescription>
          </DialogHeader>
          <Field label="Входить до">
            <SelectField
              value={parentId}
              onChange={setParentId}
              options={[
                { value: '', label: 'Нікуди — окрема категорія' },
                ...parents.map((parent) => ({ value: parent.id, label: parent.name })),
              ]}
            />
          </Field>
          <ErrorText>{update.isError && errorMessage(update.error)}</ErrorText>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Скасувати</Button>
            </DialogClose>
            <Button type="submit" disabled={update.isPending}>
              Перенести
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
