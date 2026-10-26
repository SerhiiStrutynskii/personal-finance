import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../shared/lib/utils.ts';
import { MENU_TABS, legacyShoppingPath, menuTab } from './tabs.ts';

/** Таби модуля «Меню» — посилання; активний таб визначається за шляхом. */
export function MenuTabs() {
  const { pathname } = useLocation();
  const active = menuTab(pathname);
  return (
    <nav aria-label="Розділи меню" className="flex max-w-full">
      <div className="inline-flex min-w-0 gap-1 rounded-lg bg-muted p-1">
        {MENU_TABS.map((tab) => (
          <Link
            key={tab.tab}
            to={tab.route}
            aria-current={tab.tab === active ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground max-sm:h-10',
              'aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm',
            )}
          >
            {tab.title}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Сторінки модуля «Меню»: заголовок «Меню», таби й вміст табу. */
export function MenuLayout() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold">Меню</h1>
      <MenuTabs />
      <Outlet />
    </div>
  );
}

/** Старі адреси `/shopping…` → нові в табі «Покупки», із заміною запису в історії. */
export function LegacyShoppingRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={legacyShoppingPath(pathname, search, hash) ?? '/menu/lists'} replace />;
}
