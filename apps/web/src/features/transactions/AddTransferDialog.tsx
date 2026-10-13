import type { Account } from '@hf/shared';
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
import { useCurrentUser } from '../auth/authContext.ts';
import { useSaveTransaction } from './api.ts';
import {
  defaultTransferTarget,
  initialValues,
  toTransactionInput,
  transferTargets,
  type FormErrors,
} from './transactionForm.ts';

/** Кнопка «Новий переказ» із формою переказу між рахунками в модальному вікні. */
export function AddTransferDialog({ accounts }: { accounts: Account[] }) {
  const { user } = useCurrentUser();
  const save = useSaveTransaction();

  const context = () => ({ accounts, timeZone: user.timeZone, now: new Date() });
  const blank = () => {
    const values = initialValues(context());
    return { ...values, toAccountId: defaultTransferTarget(accounts, values.accountId) };
  };

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<FormErrors>({});
  const set = (patch: Partial<typeof values>) => setValues({ ...values, ...patch });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Кожне відкриття починається з чистої форми з актуальними рахунками й сьогоднішньою датою.
      setValues(blank());
      setErrors({});
      save.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toTransactionInput('transfer', values, context());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate({ input: result.input }, { onSuccess: () => setOpen(false) });
  }

  const toOptions = (items: readonly Account[]) =>
    items.map((account) => ({ value: account.id, label: `${account.name} (${account.currency})` }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={accounts.length < 2}>
          Новий переказ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Новий переказ</DialogTitle>
            <DialogDescription>
              Переказ між власними рахунками не є ні витратою, ні доходом.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="З рахунку" error={errors.accountId}>
              <SelectField
                value={values.accountId}
                onChange={(accountId) =>
                  // Переказ на той самий рахунок неможливий: призначення треба обрати заново.
                  set({
                    accountId,
                    toAccountId: values.toAccountId === accountId ? '' : values.toAccountId,
                  })
                }
                invalid={Boolean(errors.accountId)}
                options={toOptions(accounts)}
              />
            </Field>
            <Field label="На рахунок" error={errors.toAccountId}>
              <SelectField
                value={values.toAccountId}
                onChange={(toAccountId) => set({ toAccountId })}
                invalid={Boolean(errors.toAccountId)}
                placeholder="Оберіть рахунок"
                options={toOptions(transferTargets(accounts, values.accountId))}
              />
            </Field>
            <Field label="Сума" error={errors.amount}>
              <Input
                autoFocus
                inputMode="decimal"
                placeholder="0,00"
                value={values.amount}
                aria-invalid={errors.amount ? true : undefined}
                onChange={(e) => set({ amount: e.target.value })}
              />
            </Field>
            <Field label="Дата" error={errors.date}>
              <Input
                type="date"
                value={values.date}
                aria-invalid={errors.date ? true : undefined}
                onChange={(e) => set({ date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Опис" error={errors.description}>
            <Input
              maxLength={500}
              value={values.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
          <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Скасувати</Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              Переказати
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
