import { Outlet } from 'react-router-dom';
import { MobileNav } from './MobileNav.tsx';
import { Sidebar } from './Sidebar.tsx';

export function Layout() {
  return (
    <div className="flex h-dvh flex-col bg-[#f3f5f7] md:flex-row md:gap-4 md:px-3 md:py-4">
      <MobileNav />
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto bg-white p-3 md:rounded-md md:border-2 md:border-[rgba(0,0,0,0.1)] md:p-4 md:shadow-sm">
        <Outlet />
      </main>
    </div>
  );
}
