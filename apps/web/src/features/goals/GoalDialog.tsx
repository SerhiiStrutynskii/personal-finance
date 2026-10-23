import { formatMoney, type Account, type Debt, type Goal, type UpdateGoalInput } from '@hf/shared';
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
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useSaveGoal, type CreateGoalBody } from './api.ts';
import {
  initialGoalValues,
  toCreateInput,
  toUpdateInput,
  type GoalFormErrors,
  type GoalFormValues,
  type GoalKind,
} from './goalForm.ts';
import { GOAL_KIND_LABELS, STRATEGIES, STRATEGY_LABELS } from './labels.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Рахунки, на яких можна накопичувати: у гривні, не кредитки й не архівні. */
  accounts: readonly Account[];
  /** Активні борги із залишком — для цілі виходу з боргів. */
  debts: readonly Debt[];
  /** Ціль, яку змінюють; без неї створюється нова. */
  original?: Goal | undefined;
}

/** Модальне вікно створення або зміни цілі. Керується ззовні. */
export function GoalDialog({ open, onOpenChange, original, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Вміст монтується при кожному відкритті, тому форма починається з актуальних значень. */}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{original ? 'Зміна цілі' : 'Нова ціль'}</DialogTitle>
          <DialogDescription>
            {original
              ? 'Вид цілі та її борги змінити не можна.'
              : 'Накопичення рахується за балансом рахунку, вихід із боргів — за залишками вибраних боргів.'}
          </DialogDescription>
        </DialogHeader>
        <GoalForm original={original} onSaved={() => onOpenChange(false)} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

const CURRENCY = 'UAH';
const KINDS: GoalKind[] = ['savings', 'debt_payoff'];

function GoalForm({
  today,
  accounts,
  debts,
  original,
  onSaved,
}: Omit<Props, 'open' | 'onOpenChange'> & { onSaved: () => void }) {
  const save = useSaveGoal();
  const [values, setValues] = useState(() => initialGoalValues(original));
  const [errors, setErrors] = useState<GoalFormErrors>({});
  const set = (patch: Partial<GoalFormValues>) => setValues({ ...values, ...patch });
  const isSavings = values.kind === 'savings';
  const invalid = (field: keyof GoalFormValues) => (errors[field] ? true : undefined);
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: CURRENCY });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = original ? toUpdateInput(values, original, today) : toCreateInput(values, today);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    save.mutate(
      original
        ? { id: original.id, input: result.input as UpdateGoalInput }
        : { input: result.input as CreateGoalBody },
      { onSuccess: onSaved },
    );
  }

  const toggleDebt = (debtId: string, checked: boolean) =>
    set({
      debtIds: checked
        ? [...values.debtIds, debtId]
        : values.debtIds.filter((item) => item !== debtId),
    });

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      {!original && (
        <Field label="Вид цілі">
          <SelectField
            value={values.kind}
            onChange={(kind) => set({ kind })}
            options={KINDS.map((value) => ({ value, label: GOAL_KIND_LABELS[value] }))}
          />
        </Field>
      )}
      <Field label="Назва" error={errors.name}>
        <Input
          autoFocus
          value={values.name}
          aria-invalid={invalid('name')}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>

      {isSavings ? (
        <>
          <Field label="Рахунок" error={errors.accountId}>
            <SelectField
              value={values.accountId}
              onChange={(accountId) => set({ accountId })}
              invalid={Boolean(errors.accountId)}
              placeholder="Оберіть рахунок"
              options={accounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${money(account.balance)}`,
              }))}
            />
          </Field>
          {accounts.length === 0 && (
            <Muted>
              Немає рахунку в гривні, на якому можна накопичувати. Створіть його на сторінці
              «Рахунки».
            </Muted>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`Сума цілі, ${CURRENCY}`} error={errors.targetAmount}>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={values.targetAmount}
                aria-invalid={invalid('targetAmount')}
                onChange={(e) => set({ targetAmount: e.target.value })}
              />
            </Field>
            <Field label="До дати (необов’язково)" error={errors.targetDate}>
              <Input
                type="date"
                min={today}
                value={values.targetDate}
                aria-invalid={invalid('targetDate')}
                onChange={(e) => set({ targetDate: e.target.value })}
              />
            </Field>
          </div>
          <Field
            label={`Плановий внесок на місяць, ${CURRENCY} (необов’язково)`}
            error={errors.monthlyContribution}
          >
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={values.monthlyContribution}
              aria-invalid={invalid('monthlyContribution')}
              onChange={(e) => set({ monthlyContribution: e.target.value })}
            />
          </Field>
        </>
      ) : (
        <>
          {!original && (
            <fieldset className="grid gap-2 text-sm">
              <legend className="mb-1 font-medium">Борги цілі</legend>
              {debts.length === 0 && <Muted>Активних боргів із залишком немає.</Muted>}
              {debts.length > 1 && (
                <button
                  type="button"
                  className="justify-self-start underline underline-offset-4"
                  onClick={() => set({ debtIds: debts.map((debt) => debt.id) })}
                >
                  Вибрати всі
                </button>
              )}
              {debts.map((debt) => (
                <label key={debt.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={values.debtIds.includes(debt.id)}
                    onChange={(e) => toggleDebt(debt.id, e.target.checked)}
                  />
                  <span>
                    {debt.name} · {money(debt.balance)}
                  </span>
                </label>
              ))}
              {errors.debtIds && <span className="text-destructive">{errors.debtIds}</span>}
            </fieldset>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Погасити до" error={errors.targetDate}>
              <Input
                type="date"
                min={today}
                value={values.targetDate}
                aria-invalid={invalid('targetDate')}
                onChange={(e) => set({ targetDate: e.target.value })}
              />
            </Field>
            <Field label={`Додатковий платіж на місяць, ${CURRENCY}`} error={errors.extraPayment}>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={values.extraPayment}
                aria-invalid={invalid('extraPayment')}
                onChange={(e) => set({ extraPayment: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Стратегія">
            <SelectField
              value={values.strategy}
              onChange={(strategy) => set({ strategy })}
              options={STRATEGIES.map((value) => ({ value, label: STRATEGY_LABELS[value] }))}
            />
          </Field>
          <Muted>
            Додатковий платіж — це сума понад мінімальні платежі. Вона йде на борги за порядком
            стратегії; наслідки показує план погашення на сторінці цілі.
          </Muted>
        </>
      )}

      <Field label="Опис" error={errors.description}>
        <Input
          maxLength={1000}
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
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
