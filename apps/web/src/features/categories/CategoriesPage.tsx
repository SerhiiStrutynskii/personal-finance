import { errorMessage } from '../../shared/api/index.ts';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { AddCategoryDialog } from './AddCategoryDialog.tsx';
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS, useCategories, useDeleteCategory } from './api.ts';

export function CategoriesPage() {
  const categories = useCategories();
  const remove = useDeleteCategory();

  return (
    <div>
      <PageHeader title="Категорії" action={<AddCategoryDialog />} />
      <ErrorText>{categories.isError && errorMessage(categories.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {!categories.data && !categories.isError && <Muted>Завантаження…</Muted>}

      {categories.data && (
        <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          {CATEGORY_KINDS.map((value) => {
            const items = categories.data.filter((category) => category.kind === value);
            return (
              <section key={value}>
                <h2 className="mb-2 font-heading font-semibold">{CATEGORY_KIND_LABELS[value]}</h2>
                {items.length === 0 && <Muted>Категорій ще немає</Muted>}
                <ul className="divide-y text-sm">
                  {items.map((category) => (
                    <li key={category.id} className="flex items-center justify-between gap-4 py-2">
                      {category.name}
                      {category.systemKey ? (
                        <span className="text-xs text-muted-foreground">системна</span>
                      ) : (
                        <ConfirmButton
                          title={`Видалити категорію «${category.name}»?`}
                          disabled={remove.isPending}
                          onConfirm={() => remove.mutate(category.id)}
                        />
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
