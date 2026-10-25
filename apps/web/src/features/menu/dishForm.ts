import {
  createDishSchema,
  dishPortionPrice,
  formatQuantity,
  lineTotal,
  type CreateDishInput,
  type Dish,
  type DishPortionPrice,
  type Product,
} from '@hf/shared';
import { parseQuantityField } from '../shopping/shoppingForm.ts';

export interface DishLineValues {
  /** Ключ рядка форми для React; на сервер не йде. */
  key: string;
  /** '' — продукт ще не вибрано. */
  productId: string;
  /** Кількість на порцію, як її ввели в поле: «0,15». */
  quantity: string;
}

export interface DishFormValues {
  name: string;
  lines: DishLineValues[];
}

export interface DishLineErrors {
  product?: string;
  quantity?: string;
}

export interface DishFormErrors {
  name?: string;
  /** Помилки рядків за їхнім key. */
  lines: Record<string, DishLineErrors>;
}

let lastKey = 0;
const nextKey = () => `line-${++lastKey}`;

export function emptyDishLine(): DishLineValues {
  return { key: nextKey(), productId: '', quantity: '' };
}

export function dishFormValues(dish?: Dish): DishFormValues {
  return {
    name: dish?.name ?? '',
    lines: (dish?.ingredients ?? []).map((line) => ({
      key: nextKey(),
      productId: line.productId,
      quantity: formatQuantity(line.quantityMilli),
    })),
  };
}

/** Перетворює форму на тіло запиту або повертає помилки назви й рядків. */
export function toDishInput(
  values: DishFormValues,
): { input: CreateDishInput } | { errors: DishFormErrors } {
  const errors: DishFormErrors = { lines: {} };
  const name = values.name.trim();
  if (name === '' || name.length > 100) errors.name = 'Вкажіть назву до 100 символів';

  const seen = new Set<string>();
  const ingredients: CreateDishInput['ingredients'] = [];
  for (const line of values.lines) {
    const lineErrors: DishLineErrors = {};
    if (line.productId === '') lineErrors.product = 'Виберіть продукт';
    else if (seen.has(line.productId)) lineErrors.product = 'Продукт уже є в складі';
    seen.add(line.productId);

    const quantityMilli = parseQuantityField(line.quantity);
    if (typeof quantityMilli === 'string') lineErrors.quantity = quantityMilli;

    if (lineErrors.product || lineErrors.quantity) errors.lines[line.key] = lineErrors;
    else if (typeof quantityMilli === 'number') {
      ingredients.push({ productId: line.productId, quantityMilli });
    }
  }

  if (errors.name || Object.keys(errors.lines).length > 0) return { errors };
  const parsed = createDishSchema.safeParse({ name, ingredients });
  if (!parsed.success) return { errors: { ...errors, name: 'Перевірте назву й склад' } };
  return { input: parsed.data };
}

export interface DishLinePreview {
  product: Product | undefined;
  /** Ціна рядка; null — продукт без ціни або кількість ще некоректна. */
  total: number | null;
}

export interface DishPreview {
  lines: DishLinePreview[];
  /** Ціна порції за рядками з вибраним продуктом і коректною кількістю. */
  portion: DishPortionPrice;
}

/** Ціни рядків і порції наживо, за поточними цінами довідника. */
export function previewDish(values: DishFormValues, products: readonly Product[]): DishPreview {
  const byId = new Map(products.map((product) => [product.id, product]));
  const priced: { quantityMilli: number; unitPrice: number | null }[] = [];
  const lines = values.lines.map((line): DishLinePreview => {
    const product = byId.get(line.productId);
    const quantityMilli = parseQuantityField(line.quantity);
    if (!product || typeof quantityMilli === 'string') return { product, total: null };
    priced.push({ quantityMilli, unitPrice: product.price });
    return {
      product,
      total: product.price === null ? null : lineTotal(quantityMilli, product.price),
    };
  });
  return { lines, portion: dishPortionPrice(priced) };
}

/**
 * Продукти для вибору в рядку: неархівні, а також архівний, якщо він уже в цьому рядку.
 * Продукти, вибрані в інших рядках, недоступні (disabled).
 */
export function productOptions(
  values: DishFormValues,
  lineKey: string,
  products: readonly Product[],
): { product: Product; disabled: boolean }[] {
  const current = values.lines.find((line) => line.key === lineKey)?.productId;
  const taken = new Set(
    values.lines.filter((line) => line.key !== lineKey).map((line) => line.productId),
  );
  return products
    .filter((product) => !product.isArchived || product.id === current)
    .map((product) => ({ product, disabled: taken.has(product.id) }));
}

/** «1 продукт без ціни», «2 продукти без ціни», «5 продуктів без ціни». */
export function unpricedLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'продукт'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'продукти'
        : 'продуктів';
  return `${count} ${word} без ціни`;
}

/** «2 продукти» у складі страви або «Склад не задано». */
export function ingredientCountLabel(count: number): string {
  if (count === 0) return 'Склад не задано';
  return unpricedLabel(count).replace(' без ціни', '');
}
