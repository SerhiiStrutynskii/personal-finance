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
import { HouseholdPage } from '../features/household/HouseholdPage.tsx';
import { InvitePage } from '../features/household/InvitePage.tsx';
import { MenuDictionariesPage } from '../features/menu/MenuDictionariesPage.tsx';
import { MenuPage } from '../features/menu/MenuPage.tsx';
import { MenuPrintPage } from '../features/menu/MenuPrintPage.tsx';
import { MenuShoppingPage } from '../features/menu/MenuShoppingPage.tsx';
import { LegacyShoppingRedirect, MenuLayout } from '../features/menu/MenuTabs.tsx';
import { PayoffPlanPage } from '../features/goals/PayoffPlanPage.tsx';
import { DebtsPage } from '../features/debts/DebtsPage.tsx';
import { ProductsPage } from '../features/shopping/ProductsPage.tsx';
import { PrintListPage } from '../features/shopping/PrintListPage.tsx';
import { ShoppingListPage } from '../features/shopping/ShoppingListPage.tsx';
import { ShoppingListsPage } from '../features/shopping/ShoppingListsPage.tsx';
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
            {/* Посилання-запрошення: і для гостя, і для того, хто вже ввійшов (пояснення). */}
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route element={<RequireAuth />}>
              {/* Сторінка друку — без меню застосунку. */}
              <Route path="menu/lists/:id/print" element={<PrintListPage />} />
              <Route path="menu/print/:date" element={<MenuPrintPage />} />
              {/* Старі адреси покупок: списки тепер у табі «Покупки» модуля «Меню». */}
              <Route path="shopping/*" element={<LegacyShoppingRedirect />} />
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
                {/* Модуль «Меню»: таби «Планування раціону» і «Покупки». */}
                <Route path="menu" element={<MenuLayout />}>
                  <Route index element={<MenuPage />} />
                  <Route path="dictionaries" element={<MenuDictionariesPage />} />
                  <Route path="lists" element={<ShoppingListsPage />} />
                  <Route path="lists/:id" element={<ShoppingListPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="shopping" element={<MenuShoppingPage />} />
                </Route>
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="household" element={<HouseholdPage />} />
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
