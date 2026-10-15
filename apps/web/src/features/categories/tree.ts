import { categoryPathName, type Category, type CategoryKind } from '@hf/shared';

export interface CategoryNode {
  category: Category;
  /** Підкатегорії за назвою; у підкатегорій власних немає. */
  children: Category[];
}

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'uk');

/**
 * Дерево категорій: верхній рівень за назвою, під кожною — її підкатегорії. Підкатегорія,
 * батька якої в списку немає (наприклад, інший тип), показується на верхньому рівні.
 */
export function categoryTree(categories: readonly Category[]): CategoryNode[] {
  const ids = new Set(categories.map((category) => category.id));
  const isRoot = (category: Category) => !category.parentId || !ids.has(category.parentId);
  return categories
    .filter(isRoot)
    .sort(byName)
    .map((category) => ({
      category,
      children: categories.filter((child) => child.parentId === category.id).sort(byName),
    }));
}

/** Повна назва категорії: «Комунальні › Вода». */
export function categoryLabel(category: Category, categories: readonly Category[]): string {
  const parent = category.parentId
    ? categories.find((item) => item.id === category.parentId)
    : undefined;
  return categoryPathName(category.name, parent?.name);
}

/** Пункти списку вибору: кожна група, а одразу під нею її підкатегорії з повною назвою. */
export function categoryOptions(
  categories: readonly Category[],
): { value: string; label: string }[] {
  return categoryTree(categories).flatMap(({ category, children }) => [
    { value: category.id, label: category.name },
    ...children.map((child) => ({
      value: child.id,
      label: categoryPathName(child.name, category.name),
    })),
  ]);
}

/**
 * Категорії, які можуть бути батьком для категорії типу kind: звичайні верхнього рівня.
 * exceptId — категорія, яку переносять: під саму себе її не перенести.
 */
export function parentCandidates(
  categories: readonly Category[],
  kind: CategoryKind,
  exceptId?: string,
): Category[] {
  return categories
    .filter(
      (category) =>
        category.kind === kind &&
        !category.parentId &&
        !category.systemKey &&
        category.id !== exceptId,
    )
    .sort(byName);
}
