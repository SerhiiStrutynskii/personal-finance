import {
  QuantityParseError,
  formatMoney,
  formatQuantity,
  parseQuantity,
  productNameKey,
  type AddShoppingListItemInput,
  type Product,
  type ProductUnit,
  type ShoppingListItem,
} from '@hf/shared';
import { plannedAmountText } from '../budget/plannedAmount.ts';
import { PRODUCT_UNIT_LABELS, parseUnitPrice } from './productForm.ts';

/** Кількість з поля форми в тисячних одиниці або текст помилки. */
export function parseQuantityField(text: string): number | string {
  if (text.trim() === '') return 'Вкажіть кількість';
  try {
    const quantityMilli = parseQuantity(text);
    return quantityMilli > 0 ? quantityMilli : 'Кількість має бути більшою за нуль';
  } catch (error) {
    if (error instanceof QuantityParseError) return 'Некоректна кількість, приклад: 1,5';
    throw error;
  }
}

/** «1,5 кг». */
export function quantityLabel(item: Pick<ShoppingListItem, 'quantityMilli' | 'unit'>): string {
  return `${formatQuantity(item.quantityMilli)} ${PRODUCT_UNIT_LABELS[item.unit]}`;
}

/** Продукт довідника з такою самою назвою без урахування регістру. */
export function matchProduct(name: string, products: readonly Product[]): Product | undefined {
  const key = productNameKey(name);
  return key ? products.find((product) => productNameKey(product.name) === key) : undefined;
}

export interface AddItemValues {
  name: string;
  quantity: string;
  /** Одиниця й ціна потрібні лише для нового продукту, якого ще немає в довіднику. */
  unit: ProductUnit;
  price: string;
}

export const emptyAddItemValues: AddItemValues = {
  name: '',
  quantity: '1',
  unit: 'pcs',
  price: '',
};

export type AddItemErrors = Partial<Record<'name' | 'quantity' | 'price', string>>;

export function toAddItemInput(
  values: AddItemValues,
  products: readonly Product[],
  currency: string,
): { input: AddShoppingListItemInput } | { errors: AddItemErrors } {
  const errors: AddItemErrors = {};
  const name = values.name.trim();
  if (name === '' || name.length > 100) errors.name = 'Вкажіть назву до 100 символів';
  const quantityMilli = parseQuantityField(values.quantity);
  if (typeof quantityMilli === 'string') errors.quantity = quantityMilli;

  const product = matchProduct(name, products);
  const price = product ? null : parseUnitPrice(values.price, currency);
  if (typeof price === 'string') errors.price = price;

  if (Object.keys(errors).length > 0 || typeof quantityMilli === 'string') return { errors };
  if (product) return { input: { productId: product.id, quantityMilli } };
  return {
    input: {
      name,
      unit: values.unit,
      price: typeof price === 'number' ? price : null,
      quantityMilli,
    },
  };
}

export interface ItemValues {
  quantity: string;
  expectedPrice: string;
}

export function itemFormValues(item: ShoppingListItem, currency: string): ItemValues {
  return {
    quantity: formatQuantity(item.quantityMilli),
    expectedPrice: priceText(item.expectedUnitPrice, currency),
  };
}

export type ItemErrors = Partial<Record<keyof ItemValues, string>>;

export function toItemInput(
  values: ItemValues,
  currency: string,
): { input: { quantityMilli: number; expectedUnitPrice: number | null } } | { errors: ItemErrors } {
  const errors: ItemErrors = {};
  const quantityMilli = parseQuantityField(values.quantity);
  if (typeof quantityMilli === 'string') errors.quantity = quantityMilli;
  const expectedUnitPrice = parseUnitPrice(values.expectedPrice, currency);
  if (typeof expectedUnitPrice === 'string') errors.expectedPrice = expectedUnitPrice;
  if (typeof quantityMilli === 'string' || typeof expectedUnitPrice === 'string') return { errors };
  return { input: { quantityMilli, expectedUnitPrice } };
}

/** Ціна для поля форми: 4250 → «42,50», немає ціни — порожньо. */
export function priceText(amountMinor: number | null, currency: string): string {
  return amountMinor === null ? '' : plannedAmountText(amountMinor, currency);
}

/** Сума або «—», якщо ціни немає. */
export function moneyOrDash(amountMinor: number | null, currency: string): string {
  return amountMinor === null ? '—' : formatMoney({ amountMinor, currency });
}

/** Відхилення зі знаком: «+3,00 ₴» — переплата, «−5,00 ₴» — економія. */
export function deviationLabel(deviation: number, currency: string): string {
  const amount = formatMoney({ amountMinor: Math.abs(deviation), currency });
  if (deviation > 0) return `+${amount}`;
  if (deviation < 0) return `−${amount}`;
  return amount;
}
