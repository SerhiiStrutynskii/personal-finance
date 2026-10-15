import { createCategorySchema, type Category, type CategoryKind } from '@hf/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS, useCategories, useCreateCategory } from './api.ts';
import { parentCandidates } from './tree.ts';

interface Props {
  /** Фіксований тип категорії: поле «Тип» у формі не показується. */
  fixedKind?: CategoryKind | undefined;
  /** Власна кнопка відкриття замість «Додати категорію». */
  trigger?: ReactNode;
  /** Батьківська категорія, обрана заздалегідь, — коли додають підкатегорію. */
  defaultParent?: Category | undefined;
  /** Викликається після створення, коли список категорій уже оновлено. */
  onCreated?: ((category: Category) => void) | undefined;
}

/** Кнопка «Додати категорію» з формою створення в модальному вікні. */
export function AddCategoryDialog({ fixedKind, trigger, defaultParent, onCreated }: Props = {}) {
  const create = useCreateCategory();
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedKind, setSelectedKind] = useState<CategoryKind>('expense');
  const kind = defaultParent?.kind ?? fixedKind ?? selectedKind;
  const [parentId, setParentId] = useState('');
  const [nameError, setNameError] = useState<string>();
  const parents = parentCandidates(categories.data ?? [], kind);

  function setKind(next: CategoryKind) {
    setSelectedKind(next);
    // Батько має бути того самого типу.
    setParentId('');
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Назва й помилки скидаються, а тип лишається: категорії зручно додавати серіями.
      setName('');
      setParentId(defaultParent?.id ?? '');
      setNameError(undefined);
      create.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createCategorySchema.safeParse({ name, kind, parentId: parentId || null });
    if (!parsed.success) {
      setNameError('Вкажіть назву до 100 символів');
      return;
    }
    setNameError(undefined);
    create.mutate(parsed.data, {
      onSuccess: (category) => {
        setOpen(false);
        onCreated?.(category);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? <Button>Додати категорію</Button>}</DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {defaultParent ? `Нова підкатегорія «${defaultParent.name}»` : 'Нова категорія'}
            </DialogTitle>
            <DialogDescription>
              {fixedKind || defaultParent
                ? `Тип категорії: ${CATEGORY_KIND_LABELS[kind].toLowerCase()}.`
                : 'Категорія витрат доступна лише для витрат, категорія прибутків — лише для прибутків.'}
            </DialogDescription>
          </DialogHeader>
          <Field label="Назва" error={nameError}>
            <Input
              autoFocus
              value={name}
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {!fixedKind && !defaultParent && (
            <Field label="Тип">
              <SelectField
                value={kind}
                onChange={setKind}
                options={CATEGORY_KINDS.map((value) => ({
                  value,
                  label: CATEGORY_KIND_LABELS[value],
                }))}
              />
            </Field>
          )}
          {!defaultParent && parents.length > 0 && (
            <Field label="Входить до">
              <SelectField
                value={parentId}
                onChange={setParentId}
                options={[
                  { value: '', label: 'Нікуди — окрема категорія' },
                  ...parents.map((parent) => ({ value: parent.id, label: parent.name })),
                ]}
              />
            </Field>
          )}
          <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Скасувати</Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              Додати
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
