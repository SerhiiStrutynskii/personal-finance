import type { Account, Category } from '@hf/shared';
import { useState } from 'react';
import { Button } from '../../shared/ui/button.tsx';
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
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { TransactionForm } from './TransactionForm.tsx';

interface Props {
  type: EntryType;
  accounts: Account[];
  /** Категорії того самого типу, що й запис. */
  categories: Category[];
}

/** Кнопка «Додати» з формою нової витрати або доходу в модальному вікні. */
export function AddTransactionDialog({ type, accounts, categories }: Props) {
  const config = ENTRY_CONFIG[type];
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Додати</Button>
      </DialogTrigger>
      {/* Вміст монтується при кожному відкритті, тому форма щоразу чиста й із сьогоднішньою датою. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{config.addTitle}</DialogTitle>
          <DialogDescription>{config.addDescription}</DialogDescription>
        </DialogHeader>
        <TransactionForm
          type={type}
          accounts={accounts}
          categories={categories}
          onSaved={() => setOpen(false)}
          renderActions={(submit) => (
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Скасувати</Button>
              </DialogClose>
              {submit}
            </DialogFooter>
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
