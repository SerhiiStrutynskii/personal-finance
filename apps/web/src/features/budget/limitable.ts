import type { Category } from '@hf/shared';

/**
 * Категорії, на які ще можна задати ліміт у бюджеті: без власного ліміту й без конфлікту з
 * групою. Ліміт ставиться або на групу, або на її підкатегорії — на обидва рівні не можна.
 */
export function limitableCategories(
  categories: readonly Category[],
  plannedCategoryIds: ReadonlySet<string>,
): Category[] {
  const groupsWithPlannedChildren = new Set(
    categories
      .filter((category) => category.parentId && plannedCategoryIds.has(category.id))
      .map((category) => category.parentId),
  );
  return categories.filter(
    (category) =>
      !plannedCategoryIds.has(category.id) &&
      !(category.parentId && plannedCategoryIds.has(category.parentId)) &&
      !groupsWithPlannedChildren.has(category.id),
  );
}
