import type { Product } from '@hf/shared';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useDeleteProduct, useProducts } from './api.ts';
import { ProductDialog } from './ProductDialog.tsx';
import { PRODUCT_UNIT_LABELS, formatUnitPrice } from './productForm.ts';

/** Довідник продуктів зі збереженими цінами за одиницю. */
export function ProductsPage() {
  const products = useProducts();
  const remove = useDeleteProduct();
  // Вміст вікна зберігається й після закриття, щоб не змінюватися під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; product?: Product }>({ open: false });

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Продукти"
        action={<Button onClick={() => setDialog({ open: true })}>Додати продукт</Button>}
      />
      <ErrorText>{products.isError && errorMessage(products.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
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
              className="flex min-h-10 items-center justify-between gap-4 py-1"
            >
              <span>
                {product.name}{' '}
                <span className="text-muted-foreground">· {PRODUCT_UNIT_LABELS[product.unit]}</span>
              </span>
              <span className="ml-auto tabular-nums" data-testid="product-price">
                {formatUnitPrice(product)}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Змінити «${product.name}»`}
                  title={`Змінити «${product.name}»`}
                  onClick={() => setDialog({ open: true, product })}
                >
                  <Pencil />
                </Button>
                <ConfirmButton
                  title={`Видалити продукт «${product.name}»?`}
                  disabled={remove.isPending}
                  onConfirm={() => remove.mutate(product.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ProductDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        product={dialog.product}
      />
    </div>
  );
}
