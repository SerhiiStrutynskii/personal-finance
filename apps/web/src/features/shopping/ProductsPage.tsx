import type { Product } from '@hf/shared';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChartLine,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../shared/lib/utils.ts';
import { useMediaQuery, WIDE_SCREEN } from '../../shared/lib/useMediaQuery.ts';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu.tsx';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useDeleteProduct, useProducts, useSaveProduct } from './api.ts';
import { PriceHistoryDialog } from './PriceHistoryDialog.tsx';
import { ProductDialog } from './ProductDialog.tsx';
import { PRODUCT_UNIT_LABELS, formatUnitPrice } from './productForm.ts';

const DELETE_DESCRIPTION =
  'Продукт, який уже є в списках покупок або в складі страв, видалити не можна — лише заархівувати.';

/** Довідник продуктів зі збереженими цінами за одиницю. */
export function ProductsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const products = useProducts(showArchived);
  const remove = useDeleteProduct();
  const archive = useSaveProduct();
  // Вміст вікна зберігається й після закриття, щоб не змінюватися під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [history, setHistory] = useState<Product>();
  // На телефоні чотири іконки не вміщаються поруч із ціною — дії ховаються в меню «⋯».
  const isWide = useMediaQuery(WIDE_SCREEN);
  const [deletion, setDeletion] = useState<{ open: boolean; product?: Product }>({
    open: false,
  });
  const toggleArchive = (product: Product) =>
    archive.mutate({ id: product.id, input: { isArchived: !product.isArchived } });

  return (
    <div className="max-w-3xl space-y-4">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        to="/menu/lists"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Списки покупок
      </Link>
      <PageHeader
        level={2}
        title="Продукти"
        action={<Button onClick={() => setDialog({ open: true })}>Додати продукт</Button>}
      />
      <ErrorText>{products.isError && errorMessage(products.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      <ErrorText>{archive.isError && errorMessage(archive.error)}</ErrorText>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Показати архівні
      </label>
      {products.isPending && <Muted>Завантаження…</Muted>}
      {products.data?.length === 0 && (
        <Muted>Продуктів ще немає. Додайте ті, що купуєте регулярно, разом із ціною.</Muted>
      )}

      {products.data && products.data.length > 0 && (
        <ul className="divide-y text-sm">
          {products.data.map((product) => (
            <li
              key={product.id}
              data-testid="product"
              className={cn(
                'flex min-h-10 items-center justify-between gap-3 py-1',
                product.isArchived && 'text-muted-foreground',
              )}
            >
              <span className="min-w-0 break-words">
                {product.name}{' '}
                <span className="text-muted-foreground">· {PRODUCT_UNIT_LABELS[product.unit]}</span>
                {product.isArchived && <span className="text-muted-foreground"> · в архіві</span>}
              </span>
              <span className="ml-auto shrink-0 tabular-nums" data-testid="product-price">
                {formatUnitPrice(product)}
              </span>
              {!isWide && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-2 shrink-0"
                      aria-label={`Дії з продуктом «${product.name}»`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setHistory(product)}>
                      <ChartLine />
                      Історія цін
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog({ open: true, product })}>
                      <Pencil />
                      Змінити
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={archive.isPending}
                      onSelect={() => toggleArchive(product)}
                    >
                      {product.isArchived ? <ArchiveRestore /> : <Archive />}
                      {product.isArchived ? 'Повернути з архіву' : 'Заархівувати'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={remove.isPending}
                      onSelect={() => setDeletion({ open: true, product })}
                    >
                      <Trash2 />
                      Видалити
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {isWide && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Історія цін «${product.name}»`}
                    title={`Історія цін «${product.name}»`}
                    onClick={() => setHistory(product)}
                  >
                    <ChartLine />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Змінити «${product.name}»`}
                    title={`Змінити «${product.name}»`}
                    onClick={() => setDialog({ open: true, product })}
                  >
                    <Pencil />
                  </Button>
                  <ArchiveButton
                    name={product.name}
                    isArchived={product.isArchived}
                    disabled={archive.isPending}
                    onClick={() => toggleArchive(product)}
                  />
                  <ConfirmButton
                    title={`Видалити продукт «${product.name}»?`}
                    description={DELETE_DESCRIPTION}
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate(product.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={`Видалити продукт «${deletion.product?.name ?? ''}»?`}
        description={DELETE_DESCRIPTION}
        onConfirm={() => deletion.product && remove.mutate(deletion.product.id)}
      />
      <PriceHistoryDialog product={history} onClose={() => setHistory(undefined)} />
      <ProductDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        product={dialog.product}
      />
    </div>
  );
}

/** Архівний продукт зникає з довідника й підказок, але лишається в історії покупок. */
function ArchiveButton({
  name,
  isArchived,
  disabled,
  onClick,
}: {
  name: string;
  isArchived: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label = isArchived ? `Повернути «${name}» з архіву` : `Заархівувати «${name}»`;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {isArchived ? <ArchiveRestore /> : <Archive />}
    </Button>
  );
}
