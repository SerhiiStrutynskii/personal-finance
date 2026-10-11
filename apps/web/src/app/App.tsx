import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AccountsPage } from '../features/accounts/AccountsPage.tsx';
import { AnonymousOnly, RequireAuth } from '../features/auth/AuthGate.tsx';
import { LoginPage, RegisterPage } from '../features/auth/AuthPages.tsx';
import { AuthProvider } from '../features/auth/AuthProvider.tsx';
import { BudgetPage } from '../features/budget/BudgetPage.tsx';
import { CategoriesPage } from '../features/categories/CategoriesPage.tsx';
import { ENTRY_CONFIG, type EntryType } from '../features/transactions/config.ts';
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

const ENTRY_TYPES = Object.keys(ENTRY_CONFIG) as EntryType[];

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
                {ENTRY_TYPES.map((type) => (
                  <Route
                    key={type}
                    path={ENTRY_CONFIG[type].path}
                    element={<TransactionsPage key={type} type={type} />}
                  />
                ))}
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="budget" element={<BudgetPage />} />
                <Route path="debts" element={<ComingSoonPage title="Борги" />} />
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
