import { isValidDateString } from '@hf/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted } from '../../shared/ui/controls.tsx';
import { formatDateString } from '../../shared/ui/format.ts';
import { useMealTypes, useMenuPeriod } from './api.ts';
import { dayRange, dayTitleWithYear, groupDay, servingsLabel } from './calendar.ts';

/**
 * Меню на день для друку без меню застосунку й без сум: дата, прийоми їжі з записами, страви
 * й порції. PDF — через системний діалог друку.
 */
export function MenuPrintPage() {
  const { date = '' } = useParams();
  const isValid = isValidDateString(date);
  const { from, to } = isValid ? dayRange(date) : { from: '', to: '' };
  const period = useMenuPeriod(from, to, isValid);
  const mealTypes = useMealTypes();

  // Назва вкладки стає назвою файлу, коли меню зберігають як PDF.
  useEffect(() => {
    if (!isValid) return;
    const previous = document.title;
    document.title = `Меню — ${formatDateString(date)}`;
    return () => {
      document.title = previous;
    };
  }, [date, isValid]);

  if (!isValid) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 bg-white p-6">
        <ErrorText>Невірна дата</ErrorText>
        <Link className="text-sm text-muted-foreground hover:underline" to="/menu">
          До меню
        </Link>
      </div>
    );
  }

  const groups = groupDay(period.data?.entries ?? [], mealTypes.data ?? []).filter(
    (group) => group.entries.length > 0,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden" data-testid="print-toolbar">
        <Link
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          to={`/menu?date=${date}`}
        >
          <ArrowLeft className="size-4" aria-hidden />
          До меню
        </Link>
        <Button className="ml-auto" onClick={() => window.print()}>
          <Printer />
          Друкувати
        </Button>
      </div>

      <div className="border-b pb-2">
        <h1 className="text-xl font-semibold">Меню</h1>
        <p className="text-sm first-letter:uppercase" data-testid="print-date">
          {dayTitleWithYear(date)}
        </p>
      </div>

      <ErrorText>{period.isError && errorMessage(period.error)}</ErrorText>
      <ErrorText>{mealTypes.isError && errorMessage(mealTypes.error)}</ErrorText>
      {(period.isPending || mealTypes.isPending) && <Muted>Завантаження…</Muted>}
      {period.data && mealTypes.data && groups.length === 0 && (
        <Muted>На цей день меню не заплановано</Muted>
      )}
      {groups.map(({ mealType, entries }) => (
        <section key={mealType.id} className="break-inside-avoid" data-testid="print-meal">
          <h2 className="mb-1 font-semibold">{mealType.name}</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {entries.map((entry) => (
              <li key={entry.id} data-testid="print-entry" className="break-words">
                {entry.dishName} — {servingsLabel(entry.servings)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
