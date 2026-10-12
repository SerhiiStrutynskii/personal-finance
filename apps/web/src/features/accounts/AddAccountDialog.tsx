import { DEFAULT_CURRENCY, createAccountSchema, type PlainAccountType } from '@hf/shared';
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
import { ACCOUNT_TYPE_LABELS, PLAIN_ACCOUNT_TYPES, useCreateAccount } from './api.ts';

const CURRENCIES = ['UAH', 'USD', 'EUR'];

/** Кнопка «Додати рахунок» із формою створення в модальному вікні. */
export function AddAccountDialog() {
  const create = useCreateAccount();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PlainAccountType>('card');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [nameError, setNameError] = useState<string>();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Кожне відкриття починається з чистої форми.
      setName('');
      setType('card');
      setCurrency(DEFAULT_CURRENCY);
      setNameError(undefined);
      create.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createAccountSchema.safeParse({ name, type, currency });
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
        <Button>Додати рахунок</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Новий рахунок</DialogTitle>
            <DialogDescription>Валюту рахунку після створення змінити не можна.</DialogDescription>
          </DialogHeader>
          <Field label="Назва" error={nameError}>
            <Input
              autoFocus
              value={name}
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Тип">
              <SelectField
                value={type}
                onChange={setType}
                options={PLAIN_ACCOUNT_TYPES.map((value) => ({
                  value,
                  label: ACCOUNT_TYPE_LABELS[value],
                }))}
              />
            </Field>
            <Field label="Валюта">
              <SelectField
                value={currency}
                onChange={setCurrency}
                options={CURRENCIES.map((value) => ({ value, label: value }))}
              />
            </Field>
          </div>
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
