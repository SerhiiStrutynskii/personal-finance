import { formatMoney, formatQuantity } from '@hf/shared';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { useCurrentUser } from '../auth/authContext.ts';
import { errorMessage } from '../../shared/api/index.ts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../shared/ui/chart.tsx';
import { ErrorText, Muted } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { formatDate } from '../../shared/ui/format.ts';
import { useProductPrices } from './api.ts';
import { PRODUCT_UNIT_LABELS } from './productForm.ts';

const chartConfig = { unitPrice: { label: 'Ціна', color: 'var(--chart-3)' } };

interface Props {
  /** Продукт, чию історію показати; undefined — діалог закритий. */
  product: { id: string; name: string } | undefined;
  onClose: () => void;
}

/** Фактичні ціни продукту з куплених рядків списків: графік і перелік покупок. */
export function PriceHistoryDialog({ product, onClose }: Props) {
  return (
    <Dialog open={product !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{`Історія цін «${product?.name ?? ''}»`}</DialogTitle>
          <DialogDescription>Фактичні ціни з куплених рядків списків покупок.</DialogDescription>
        </DialogHeader>
        {product && <PriceHistory productId={product.id} />}
      </DialogContent>
    </Dialog>
  );
}

function PriceHistory({ productId }: { productId: string }) {
  const { user } = useCurrentUser();
  const history = useProductPrices(productId);
  if (history.isError) return <ErrorText>{errorMessage(history.error)}</ErrorText>;
  if (!history.data) return <Muted>Завантаження…</Muted>;

  const { product, points } = history.data;
  const unit = PRODUCT_UNIT_LABELS[product.unit];
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: product.currency });
  const date = (instant: string) => formatDate(instant, user.timeZone);
  if (points.length === 0) {
    return <Muted>Цей продукт ще не купували за списками.</Muted>;
  }

  return (
    <div className="space-y-4">
      {points.length > 1 && (
        <ChartContainer config={chartConfig} className="aspect-auto h-48 w-full">
          <LineChart accessibilityLayer data={points} margin={{ left: 12, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="boughtAt"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value) => date(String(value))}
            />
            <YAxis hide domain={['auto', 'auto']} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => date(String(payload[0]?.payload.boughtAt))}
                  formatter={(value) => `${money(Number(value))} / ${unit}`}
                />
              }
            />
            <Line
              dataKey="unitPrice"
              type="linear"
              stroke="var(--color-unitPrice)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
      <ul className="max-h-60 divide-y overflow-auto text-sm">
        {[...points].reverse().map((point) => (
          <li
            key={`${point.listId}:${point.boughtAt}`}
            className="flex justify-between gap-4 py-1.5"
            data-testid="price-point"
          >
            <span>
              {date(point.boughtAt)}{' '}
              <span className="text-muted-foreground">
                · {point.listName} · {formatQuantity(point.quantityMilli)} {unit}
              </span>
            </span>
            <span className="tabular-nums">
              {money(point.unitPrice)} / {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
