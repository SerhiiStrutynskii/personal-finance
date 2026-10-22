import {
  MoneyParseError,
  MoneyRangeError,
  createProductSchema,
  formatMoney,
  parseMoney,
  type CreateProductInput,
  type Product,
  type ProductUnit,
} from '@hf/shared';
import { plannedAmountText } from '../budget/plannedAmount.ts';

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  pcs: 'шт',
  kg: 'кг',
  l: 'л',
  pack: 'уп',
};

export interface ProductFormValues {
  name: string;
  unit: ProductUnit;
  /** Ціна за одиницю, як її ввели в поле; порожньо — ціна невідома. */
  price: string;
}

export type ProductFormErrors = Partial<Record<'name' | 'price', string>>;

export function productFormValues(product?: Product): ProductFormValues {
  return {
    name: product?.name ?? '',
    unit: product?.unit ?? 'pcs',
    price: product?.price != null ? plannedAmountText(product.price, product.currency) : '',
  };
}

/** Ціна за одиницю з поля форми: null для порожнього поля або текст помилки. */
export function parseUnitPrice(text: string, currency: string): number | null | string {
  if (text.trim() === '') return null;
  try {
    const { amountMinor } = parseMoney(text.trim(), currency);
    return amountMinor > 0 ? amountMinor : 'Ціна має бути більшою за нуль';
  } catch (error) {
    if (error instanceof MoneyRangeError) return 'Ціна завелика';
    if (error instanceof MoneyParseError) return 'Некоректна ціна, приклад: 42,50';
    throw error;
  }
}

export function toProductInput(
  values: ProductFormValues,
  currency: string,
): { input: CreateProductInput } | { errors: ProductFormErrors } {
  const errors: ProductFormErrors = {};
  const price = parseUnitPrice(values.price, currency);
  if (typeof price === 'string') errors.price = price;
  // Ціну вже перевірено вище, тож схема тут перевіряє назву й одиницю.
  const parsed = createProductSchema.safeParse({
    name: values.name,
    unit: values.unit,
    price: typeof price === 'number' ? price : null,
  });
  if (!parsed.success) errors.name = 'Вкажіть назву до 100 символів';
  if (!parsed.success || errors.price) return { errors };
  return { input: parsed.data };
}

/** «42,50 ₴ / л» або «—», якщо ціни немає. */
export function formatUnitPrice(product: Pick<Product, 'price' | 'unit' | 'currency'>): string {
  if (product.price === null) return '—';
  const price = formatMoney({ amountMinor: product.price, currency: product.currency });
  return `${price} / ${PRODUCT_UNIT_LABELS[product.unit]}`;
}
