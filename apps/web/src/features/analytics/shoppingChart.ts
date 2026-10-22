import type { ShoppingPeriod } from '@hf/shared';

export interface PieSlice {
  key: string;
  name: string;
  spent: number;
  share: number;
}

/**
 * Частки для кругової діаграми: `limit` продуктів з найбільшими витратами, решта — одним
 * сектором «Інші продукти». Порожні продукти не показуються.
 */
export function topProductSlices(period: ShoppingPeriod, limit = 10): PieSlice[] {
  const products = period.products.filter((product) => product.spent > 0);
  const slices: PieSlice[] = products.slice(0, limit).map((product) => ({
    key: product.productId,
    name: product.name,
    spent: product.spent,
    share: product.share,
  }));
  const rest = products.slice(limit);
  if (rest.length > 0) {
    const spent = rest.reduce((sum, product) => sum + product.spent, 0);
    slices.push({
      key: 'other',
      name: `Інші продукти (${rest.length})`,
      spent,
      share: period.total === 0 ? 0 : spent / period.total,
    });
  }
  return slices;
}

/** Колір сектора: десять помітно різних відтінків, «Інші» — сірий. */
export function sliceColor(index: number, key: string): string {
  if (key === 'other') return 'var(--muted-foreground)';
  return `oklch(0.68 0.15 ${(index * 360) / 10 + 20})`;
}
