import { formatMoney, type BudgetView } from '@hf/shared';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../shared/ui/button.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { LineMenu } from './LineMenu.tsx';

type IncomeLine = BudgetView['incomeLines'][number];

interface Props {
  budget: BudgetView;
  editable: boolean;
  canAddTransactions: boolean;
  onAddLine: () => void;
  onEditLine: (line: IncomeLine) => void;
  onDeleteLine: (line: IncomeLine) => void;
  onAddIncome: (incomeLineId: string | null) => void;
  /** Таблиця фактичних записів доходів за місяць. */
  records: ReactNode;
}

export function IncomeSection({
  budget,
  editable,
  canAddTransactions,
  onAddLine,
  onEditLine,
  onDeleteLine,
  onAddIncome,
  records,
}: Props) {
  const { currency } = budget;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  // Знак показується явно: «+500,00 грн» понад план, «−500,00 грн» — недоотримано.
  const signed = (amountMinor: number) =>
    `${amountMinor > 0 ? '+' : amountMinor < 0 ? '−' : ''}${money(Math.abs(amountMinor))}`;

  const addButton = (incomeLineId: string | null) =>
    canAddTransactions && (
      <Button variant="outline" size="sm" onClick={() => onAddIncome(incomeLineId)}>
        <Plus />
        дохід
      </Button>
    );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Доходи</h2>
        {editable && (
          <Button variant="outline" onClick={onAddLine}>
            Додати статтю
          </Button>
        )}
      </div>

      {budget.incomeLines.length === 0 && budget.otherIncome === 0 ? (
        <div className="flex items-center justify-between gap-4">
          <Muted>Статей доходу ще немає.</Muted>
          {addButton(null)}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Стаття</TableHead>
              <TableHead className="text-right">План</TableHead>
              <TableHead className="text-right">Факт</TableHead>
              <TableHead className="text-right">Різниця</TableHead>
              <TableHead>
                <span className="sr-only">Дії</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budget.incomeLines.map((line) => (
              <TableRow key={line.id} data-testid="income-line">
                <TableCell className="font-medium">{line.name}</TableCell>
                <TableCell className="text-right tabular-nums">{money(line.planned)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(line.received)}</TableCell>
                <TableCell className="text-right tabular-nums">{signed(line.diff)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {addButton(line.id)}
                    {editable && (
                      <LineMenu
                        label={`Дії зі статтею «${line.name}»`}
                        onEdit={() => onEditLine(line)}
                        onDelete={() => onDeleteLine(line)}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            <TableRow data-testid="other-income">
              <TableCell className="text-muted-foreground">Інші доходи</TableCell>
              <TableCell className="text-right text-muted-foreground">—</TableCell>
              <TableCell className="text-right tabular-nums">{money(budget.otherIncome)}</TableCell>
              <TableCell className="text-right text-muted-foreground">—</TableCell>
              <TableCell>
                <div className="flex justify-end">{addButton(null)}</div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}

      {records}
    </section>
  );
}
