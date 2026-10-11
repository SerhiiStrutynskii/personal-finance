import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useAccounts } from '../accounts/api.ts';
import { useCategories } from '../categories/api.ts';
import { useTransaction } from './api.ts';
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { TransactionForm } from './TransactionForm.tsx';

/** Сторінка редагування витрати або доходу. Нові записи створюються в модальному вікні списку. */
export function TransactionFormPage({ type }: { type: EntryType }) {
  const config = ENTRY_CONFIG[type];
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const accounts = useAccounts();
  const categories = useCategories();
  const transaction = useTransaction(id);

  const error = accounts.error ?? categories.error ?? transaction.error;
  // Витрату не можна відкрити за адресою доходу і навпаки.
  const wrongType = transaction.data && transaction.data.type !== type;

  return (
    <div className="max-w-md">
      <PageHeader title={config.editTitle} />
      {error || wrongType ? (
        <ErrorText>{wrongType ? 'Запис не знайдено' : errorMessage(error)}</ErrorText>
      ) : !accounts.data || !categories.data || !transaction.data ? (
        <Muted>Завантаження…</Muted>
      ) : (
        <TransactionForm
          key={transaction.data.id}
          type={type}
          original={transaction.data}
          accounts={accounts.data}
          categories={categories.data.filter((category) => category.kind === type)}
          onSaved={() => navigate(config.path)}
          renderActions={(submit) => (
            <div className="flex gap-2">
              {submit}
              <Button variant="outline" asChild>
                <Link to={config.path}>Скасувати</Link>
              </Button>
            </div>
          )}
        />
      )}
    </div>
  );
}
