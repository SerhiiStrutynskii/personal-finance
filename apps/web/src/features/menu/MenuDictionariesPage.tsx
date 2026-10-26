import { formatMoney, type DishSummary, type MealType } from '@hf/shared';
import { ArrowDown, ArrowLeft, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { useMediaQuery, WIDE_SCREEN } from '../../shared/lib/useMediaQuery.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu.tsx';
import { ListRow } from '../../shared/ui/list-row.tsx';
import {
  useDeleteDish,
  useDeleteMealType,
  useDishes,
  useMealTypes,
  useReorderMealTypes,
} from './api.ts';
import { DishDialog } from './DishDialog.tsx';
import { ingredientCountLabel } from './dishForm.ts';
import { IncompletePriceBadge } from './IncompletePriceBadge.tsx';
import { MealTypeDialog } from './MealTypeDialog.tsx';

const DELETE_MEAL_TYPE =
  'Прийом їжі зникне з довідника меню. Якщо в ньому є страви в меню, спершу приберіть їх з календаря.';
const DELETE_DISH =
  'Страва зникне разом зі складом. Продукти лишаться в довіднику. Якщо страва є в меню, спершу приберіть її з календаря.';

/** Довідники меню: прийоми їжі та страви з ціною порції. */
export function MenuDictionariesPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          to="/menu"
        >
          <ArrowLeft className="size-4" aria-hidden />
          До календаря
        </Link>
        <PageHeader title="Довідники меню" level={2} />
      </div>
      <MealTypesSection />
      <DishesSection />
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {action}
    </div>
  );
}

/** Меню «⋯» для телефона, де всі іконки дій не вміщаються. */
function RowMenu({
  label,
  onEdit,
  editLabel,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  editLabel: string;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          {editLabel}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Видалити
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MealTypesSection() {
  const mealTypes = useMealTypes();
  const reorder = useReorderMealTypes();
  const remove = useDeleteMealType();
  const isWide = useMediaQuery(WIDE_SCREEN);
  // Вміст вікон зберігається й після закриття, щоб не змінюватися під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; mealType?: MealType }>({ open: false });
  const [deletion, setDeletion] = useState<{ open: boolean; mealType?: MealType }>({
    open: false,
  });
  const items = mealTypes.data ?? [];

  function move(index: number, offset: -1 | 1) {
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    reorder.mutate(ids);
  }

  return (
    <section className="space-y-3" aria-label="Прийоми їжі">
      <SectionHeader
        title="Прийоми їжі"
        action={
          <Button variant="outline" onClick={() => setDialog({ open: true })}>
            <Plus />
            Додати прийом їжі
          </Button>
        }
      />
      <ErrorText>{mealTypes.isError && errorMessage(mealTypes.error)}</ErrorText>
      <ErrorText>{reorder.isError && errorMessage(reorder.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {mealTypes.isPending && <Muted>Завантаження…</Muted>}
      {mealTypes.data?.length === 0 && (
        <Muted>Прийомів їжі немає. Додайте, наприклад, «Сніданок», «Обід» і «Вечеря».</Muted>
      )}
      {items.length > 0 && (
        <ul className="divide-y text-sm">
          {items.map((mealType, index) => (
            <li
              key={mealType.id}
              data-testid="meal-type"
              className="flex min-h-10 items-center justify-between gap-2 py-1"
            >
              <span className="min-w-0 flex-1 break-words">{mealType.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size={isWide ? 'icon-sm' : 'icon'}
                  aria-label={`Вгору «${mealType.name}»`}
                  title="Вгору"
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size={isWide ? 'icon-sm' : 'icon'}
                  aria-label={`Вниз «${mealType.name}»`}
                  title="Вниз"
                  disabled={index === items.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                {isWide ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Перейменувати «${mealType.name}»`}
                      title={`Перейменувати «${mealType.name}»`}
                      onClick={() => setDialog({ open: true, mealType })}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      title={`Видалити прийом їжі «${mealType.name}»?`}
                      description={DELETE_MEAL_TYPE}
                      disabled={remove.isPending}
                      onConfirm={() => remove.mutate(mealType.id)}
                    />
                  </>
                ) : (
                  <RowMenu
                    label={`Дії з прийомом їжі «${mealType.name}»`}
                    editLabel="Перейменувати"
                    onEdit={() => setDialog({ open: true, mealType })}
                    onDelete={() => setDeletion({ open: true, mealType })}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={`Видалити прийом їжі «${deletion.mealType?.name ?? ''}»?`}
        description={DELETE_MEAL_TYPE}
        onConfirm={() => deletion.mealType && remove.mutate(deletion.mealType.id)}
      />
      <MealTypeDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        mealType={dialog.mealType}
        mealTypes={items}
      />
    </section>
  );
}

function DishesSection() {
  const dishes = useDishes();
  const remove = useDeleteDish();
  const isWide = useMediaQuery(WIDE_SCREEN);
  const [dialog, setDialog] = useState<{ open: boolean; dishId?: string }>({ open: false });
  const [deletion, setDeletion] = useState<{ open: boolean; dish?: DishSummary }>({
    open: false,
  });

  return (
    <section className="space-y-3" aria-label="Страви">
      <SectionHeader
        title="Страви"
        action={
          <Button onClick={() => setDialog({ open: true })}>
            <Plus />
            Додати страву
          </Button>
        }
      />
      <ErrorText>{dishes.isError && errorMessage(dishes.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {dishes.isPending && <Muted>Завантаження…</Muted>}
      {dishes.data?.length === 0 && (
        <Muted>
          Страв ще немає. Додайте страву й склад однієї порції з продуктів довідника — ціна порції
          порахується з їхніх цін.
        </Muted>
      )}
      {dishes.data && dishes.data.length > 0 && (
        <ul className="divide-y text-sm">
          {dishes.data.map((dish) => (
            <ListRow
              key={dish.id}
              data-testid="dish"
              className="py-2"
              meta={ingredientCountLabel(dish.ingredientCount)}
              amount={
                <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  {!dish.isPriceComplete && (
                    <IncompletePriceBadge unpricedCount={dish.unpricedCount} />
                  )}
                  <span data-testid="dish-price">
                    {formatMoney({ amountMinor: dish.portionPrice, currency: dish.currency })}
                  </span>
                </span>
              }
              note="за порцію"
              actions={
                isWide ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Редагувати «${dish.name}»`}
                      title={`Редагувати «${dish.name}»`}
                      onClick={() => setDialog({ open: true, dishId: dish.id })}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmButton
                      title={`Видалити страву «${dish.name}»?`}
                      description={DELETE_DISH}
                      disabled={remove.isPending}
                      onConfirm={() => remove.mutate(dish.id)}
                    />
                  </div>
                ) : (
                  <RowMenu
                    label={`Дії зі стравою «${dish.name}»`}
                    editLabel="Редагувати"
                    onEdit={() => setDialog({ open: true, dishId: dish.id })}
                    onDelete={() => setDeletion({ open: true, dish })}
                  />
                )
              }
            >
              {dish.name}
            </ListRow>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={`Видалити страву «${deletion.dish?.name ?? ''}»?`}
        description={DELETE_DISH}
        onConfirm={() => deletion.dish && remove.mutate(deletion.dish.id)}
      />
      <DishDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        dishId={dialog.dishId}
      />
    </section>
  );
}
