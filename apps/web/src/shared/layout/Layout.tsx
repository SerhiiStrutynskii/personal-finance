import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';

export function Layout() {
  return (
    <div className="flex h-screen gap-4 bg-[#f3f5f7] px-3 py-4">
      <Sidebar />
      <main className="w-full overflow-auto rounded-md border-2 border-[rgba(0,0,0,0.1)] bg-white p-4 shadow-sm">
        <Outlet />
      </main>
    </div>
  );
}
