import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AccountsPage } from '../features/accounts/AccountsPage.tsx';
import { AnonymousOnly, RequireAuth } from '../features/auth/AuthGate.tsx';
import { LoginPage, RegisterPage } from '../features/auth/AuthPages.tsx';
import { AuthProvider } from '../features/auth/AuthProvider.tsx';
import { BudgetPage } from '../features/budget/BudgetPage.tsx';
import { CategoriesPage } from '../features/categories/CategoriesPage.tsx';
import { IncomesPage } from '../features/incomes/IncomesPage.tsx';
import { SourcesPage } from '../features/incomes/SourcesPage.tsx';
import { AnalyticsPage } from '../features/analytics/AnalyticsPage.tsx';
import { DashboardPage } from '../features/dashboard/DashboardPage.tsx';
import { DebtPage } from '../features/debts/DebtPage.tsx';
import { GoalsPage } from '../features/goals/GoalsPage.tsx';
import { PayoffPlanPage } from '../features/goals/PayoffPlanPage.tsx';
import { DebtsPage } from '../features/debts/DebtsPage.tsx';
import { ProductsPage } from '../features/shopping/ProductsPage.tsx';
import { TransactionsPage } from '../features/transactions/TransactionsPage.tsx';
import { Layout } from '../shared/layout/Layout.tsx';
import './app.css';
import { NotFoundPage } from './pages.tsx';
import { createQueryClient } from './queryClient.ts';

const queryClient = createQueryClient();

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
                <Route path="goals" element={<GoalsPage />} />
                <Route path="goals/:id" element={<PayoffPlanPage />} />
                <Route path="shopping/products" element={<ProductsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      {/* Лише в режимі розробки: у production-збірці пакет підставляє порожній компонент. */}
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
}
