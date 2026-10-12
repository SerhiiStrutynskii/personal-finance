import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AccountsPage } from '../features/accounts/AccountsPage.tsx';
import { AnonymousOnly, RequireAuth } from '../features/auth/AuthGate.tsx';
import { LoginPage, RegisterPage } from '../features/auth/AuthPages.tsx';
import { AuthProvider } from '../features/auth/AuthProvider.tsx';
import { BudgetPage } from '../features/budget/BudgetPage.tsx';
import { CategoriesPage } from '../features/categories/CategoriesPage.tsx';
import { IncomesPage } from '../features/incomes/IncomesPage.tsx';
import { SourcesPage } from '../features/incomes/SourcesPage.tsx';
import { DebtPage } from '../features/debts/DebtPage.tsx';
import { DebtsPage } from '../features/debts/DebtsPage.tsx';
import { TransactionsPage } from '../features/transactions/TransactionsPage.tsx';
import { ApiError } from '../shared/api/index.ts';
import { Layout } from '../shared/layout/Layout.tsx';
import './app.css';
import { ComingSoonPage, DashboardPage, NotFoundPage } from './pages.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Відповідь API з помилкою повторювати немає сенсу; повторюємо лише збої мережі.
      retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AnonymousOnly />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="expenses" element={<TransactionsPage type="expense" />} />
                <Route path="incomes" element={<IncomesPage />} />
                <Route path="incomes/sources" element={<SourcesPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="budget" element={<BudgetPage />} />
                <Route path="debts" element={<DebtsPage />} />
                <Route path="debts/:id" element={<DebtPage />} />
                <Route path="analytics" element={<ComingSoonPage title="Аналітика" />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
