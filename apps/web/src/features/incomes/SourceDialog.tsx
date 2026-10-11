import { previewOccurrenceDates, type Account, type IncomeSource } from '@hf/shared';
import { useState, type FormEvent } from 'react';
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
import { formatDateString } from '../../shared/ui/format.ts';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useSaveSource } from './api.ts';
import {
  FREQUENCY_LABELS,
  WEEKDAY_LABELS,
  initialSourceValues,
  ruleFromValues,
  toSourceInput,
  type Frequency,
  type SourceFormErrors,
} from './sourceForm.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: IncomeSource | undefined;
  /** Рахунки у валюті доходів. */
  accounts: readonly Account[];
  currency: string;
  today: string;
}

const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as Frequency[];

/** Вікно створення або зміни джерела періодичного доходу з прев'ю найближчих дат. */
export function SourceDialog({ open, onOpenChange, source, ...form }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{source ? 'Джерело доходу' : 'Нове джерело доходу'}</DialogTitle>
          <DialogDescription>
            {source
              ? 'Зміни суми чи графіка стосуються лише майбутніх неотриманих надходжень.'
              : 'Регулярний дохід: зарплата, аванс, оренда, пенсія. Аванс і зарплата — два окремі джерела.'}
          </DialogDescription>
        </DialogHeader>
        <SourceForm source={source} {...form} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SourceForm({
  source,
  accounts,
  currency,
  today,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const save = useSaveSource();
  const [values, setValues] = useState(() =>
    initialSourceValues(source, { accountId: accounts[0]?.id ?? '', today }),
  );
  const [errors, setErrors] = useState<SourceFormErrors>({});
  const set = (patch: Partial<typeof values>) => setValues({ ...values, ...patch });

  const byMonth = values.frequency === 'monthly' || values.frequency === 'every_n_months';
  const rule = ruleFromValues(values);
  const preview = rule ? previewOccurrenceDates(rule, today, 3) : [];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toSourceInput(values, currency);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate({ id: source?.id, input: result.input }, { onSuccess: onDone });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="Назва" error={errors.name}>
        <Input
          autoFocus
          placeholder="Зарплата"
          value={values.name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Сума одного надходження, ${currency}`} error={errors.amount}>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={values.amount}
            aria-invalid={errors.amount ? true : undefined}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </Field>
        <Field label="Рахунок" error={errors.accountId}>
          <SelectField
            value={values.accountId}
            onChange={(accountId) => set({ accountId })}
            invalid={Boolean(errors.accountId)}
            options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Повторення">
          <SelectField
            value={values.frequency}
            onChange={(frequency) => set({ frequency })}
            options={FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABELS[value] }))}
          />
        </Field>
        {byMonth ? (
          <Field label="День місяця" error={errors.dayOfMonth}>
            <Input
              inputMode="numeric"
              value={values.dayOfMonth}
              aria-invalid={errors.dayOfMonth ? true : undefined}
              onChange={(e) => set({ dayOfMonth: e.target.value })}
            />
          </Field>
        ) : (
          <Field label="День тижня" error={errors.dayOfWeek}>
            <SelectField
              value={values.dayOfWeek}
              onChange={(dayOfWeek) => set({ dayOfWeek })}
              options={WEEKDAY_LABELS.map((label, index) => ({ value: String(index + 1), label }))}
            />
          </Field>
        )}
      </div>
      {values.frequency === 'every_n_months' && (
        <Field label="Інтервал, місяців" error={errors.intervalMonths}>
          <Input
            inputMode="numeric"
            value={values.intervalMonths}
            aria-invalid={errors.intervalMonths ? true : undefined}
            onChange={(e) => set({ intervalMonths: e.target.value })}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Початок" error={errors.startDate}>
          <Input
            type="date"
            value={values.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
          />
        </Field>
        <Field label="Завершення (необовʼязково)" error={errors.endDate}>
          <Input
            type="date"
            value={values.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </Field>
      </div>

      <div data-testid="source-preview">
        <Muted>
          {preview.length > 0
            ? `Найближчі надходження: ${preview.map(formatDateString).join(', ')}`
            : 'Найближчих надходжень за цим правилом немає.'}
        </Muted>
        {byMonth && Number(values.dayOfMonth) > 28 && (
          <Muted>Якщо в місяці менше днів, надходження припаде на його останній день.</Muted>
        )}
      </div>

      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
