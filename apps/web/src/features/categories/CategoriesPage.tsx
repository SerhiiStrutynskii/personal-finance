import { createCategorySchema, type CategoryKind } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { ErrorText, Field, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useCategories, useCreateCategory, useDeleteCategory } from './api.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';

const KIND_TITLES: Record<CategoryKind, string> = { expense: 'Витрати', income: 'Доходи' };
const KINDS = Object.keys(KIND_TITLES) as CategoryKind[];

export function CategoriesPage() {
  const categories = useCategories();
  const create = useCreateCategory();
  const remove = useDeleteCategory();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [nameError, setNameError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createCategorySchema.safeParse({ name, kind });
    if (!parsed.success) {
      setNameError('Вкажіть назву до 100 символів');
      return;
    }
    setNameError(undefined);
    create.mutate(parsed.data, { onSuccess: () => setName('') });
  }

  return (
    <div>
      <PageHeader title="Категорії" />
      <ErrorText>{categories.isError && errorMessage(categories.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {!categories.data && !categories.isError && <Muted>Завантаження…</Muted>}

      {categories.data && (
        <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          {KINDS.map((value) => {
            const items = categories.data.filter((category) => category.kind === value);
            return (
              <section key={value}>
                <h2 className="mb-2 font-heading font-semibold">{KIND_TITLES[value]}</h2>
                {items.length === 0 && <Muted>Категорій ще немає</Muted>}
                <ul className="divide-y text-sm">
                  {items.map((category) => (
                    <li key={category.id} className="flex items-center justify-between gap-4 py-2">
                      {category.name}
                      <ConfirmButton
                        title={`Видалити категорію «${category.name}»?`}
                        disabled={remove.isPending}
                        onConfirm={() => remove.mutate(category.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <form
        className="mt-6 grid max-w-3xl grid-cols-1 items-start gap-3 sm:grid-cols-[2fr_1fr_auto]"
        onSubmit={handleSubmit}
        noValidate
      >
        <Field label="Назва нової категорії" error={nameError}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Тип">
          <SelectField
            value={kind}
            onChange={setKind}
            options={KINDS.map((value) => ({ value, label: KIND_TITLES[value] }))}
          />
        </Field>
        <Button type="submit" className="sm:mt-[26px]" disabled={create.isPending}>
          Додати
        </Button>
        <div className="sm:col-span-3">
          <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
        </div>
      </form>
    </div>
  );
}
