import type { Account, Category, Transaction } from '@hf/shared';
import { Button } from '../../shared/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { TransactionForm } from './TransactionForm.tsx';

interface Props {
  type: EntryType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Запис, який редагують; без нього вікно створює новий. */
  original?: Transaction | undefined;
  accounts: Account[];
  /** Категорії того самого типу, що й запис. */
  categories: Category[];
}

/** Модальне вікно з формою витрати або доходу: створення або редагування. Керується ззовні. */
export function TransactionDialog({
  type,
  open,
  onOpenChange,
  original,
  accounts,
  categories,
}: Props) {
  const config = ENTRY_CONFIG[type];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Вміст монтується при кожному відкритті, тому форма щоразу починається з актуальних даних. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{original ? config.editTitle : config.addTitle}</DialogTitle>
          <DialogDescription>
            {original ? config.editDescription : config.addDescription}
          </DialogDescription>
        </DialogHeader>
        <TransactionForm
          type={type}
          original={original}
          accounts={accounts}
          categories={categories}
          onSaved={() => onOpenChange(false)}
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
