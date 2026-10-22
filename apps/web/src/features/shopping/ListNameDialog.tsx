import type { ShoppingList, ShoppingListSummary } from '@hf/shared';
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
import { useSaveShoppingList } from './api.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Список для перейменування; без нього форма створює новий. */
  list?: Pick<ShoppingListSummary, 'id' | 'name'> | undefined;
  onSaved?: (list: ShoppingList) => void;
}

/** Назва нового списку або перейменування наявного. */
export function ListNameDialog({ open, onOpenChange, list, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <ListNameForm
            list={list}
            onDone={(saved) => {
              onOpenChange(false);
              onSaved?.(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListNameForm({
  list,
  onDone,
}: {
  list?: Props['list'];
  onDone: (list: ShoppingList) => void;
}) {
  const save = useSaveShoppingList();
  const [name, setName] = useState(list?.name ?? '');
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 100) {
      setError('Вкажіть назву до 100 символів');
      return;
    }
    setError(undefined);
    save.mutate({ id: list?.id, input: { name: trimmed } }, { onSuccess: onDone });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{list ? 'Перейменувати список' : 'Новий список покупок'}</DialogTitle>
      </DialogHeader>
      <Field label="Назва" error={error}>
        <Input
          autoFocus
          value={name}
          placeholder="Наприклад, «На тиждень»"
          aria-invalid={error ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {list ? 'Зберегти' : 'Створити'}
        </Button>
      </DialogFooter>
    </form>
  );
}
