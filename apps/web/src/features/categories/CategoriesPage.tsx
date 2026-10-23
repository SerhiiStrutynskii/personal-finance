import type { Category } from '@hf/shared';
import { Plus } from 'lucide-react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useIsOwner } from '../auth/authContext.ts';
import { AddCategoryDialog } from './AddCategoryDialog.tsx';
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS, useCategories, useDeleteCategory } from './api.ts';
import { MoveCategoryDialog } from './MoveCategoryDialog.tsx';
import { categoryTree } from './tree.ts';

export function CategoriesPage() {
  const categories = useCategories();
  const remove = useDeleteCategory();
  const isOwner = useIsOwner();

  function actions(category: Category, hasChildren: boolean) {
    if (category.systemKey) {
      return <span className="text-xs text-muted-foreground">системна</span>;
    }
    if (!isOwner) return null;
    return (
      <div className="flex items-center gap-1">
        {!category.parentId && (
          <AddCategoryDialog
            defaultParent={category}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Підкатегорія в «${category.name}»`}
              >
                <Plus />
              </Button>
            }
          />
        )}
        {/* Група з підкатегоріями не переноситься: вийшло б три рівні. */}
        {!hasChildren && (
          <MoveCategoryDialog category={category} categories={categories.data ?? []} />
        )}
        <ConfirmButton
          title={`Видалити категорію «${category.name}»?`}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(category.id)}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Категорії" action={isOwner && <AddCategoryDialog />} />
      <ErrorText>{categories.isError && errorMessage(categories.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {!categories.data && !categories.isError && <Muted>Завантаження…</Muted>}

      {categories.data && (
        <div className="grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
          {CATEGORY_KINDS.map((value) => {
            const tree = categoryTree(
              categories.data.filter((category) => category.kind === value),
            );
            return (
              <section key={value}>
                <h2 className="mb-2 font-heading font-semibold">{CATEGORY_KIND_LABELS[value]}</h2>
                {tree.length === 0 && <Muted>Категорій ще немає</Muted>}
                <ul className="divide-y text-sm">
                  {tree.map(({ category, children }) => (
                    <li key={category.id} className="py-1" data-testid="category-group">
                      <div className="flex min-h-9 items-center justify-between gap-4">
                        <span className="font-medium">{category.name}</span>
                        {actions(category, children.length > 0)}
                      </div>
                      {children.length > 0 && (
                        <ul className="ml-4 border-l pl-3">
                          {children.map((child) => (
                            <li
                              key={child.id}
                              className="flex min-h-9 items-center justify-between gap-4"
                            >
                              {child.name}
                              {actions(child, false)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
