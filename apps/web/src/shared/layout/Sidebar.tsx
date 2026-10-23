import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavList } from './NavList.tsx';
import { initialSidebarOpen, writeSidebarOpen } from './sidebarPreference.ts';

/** Сайдбар від планшета й ширше; на телефоні його замінює MobileNav. */
export function Sidebar() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    initialSidebarOpen(window.localStorage, window.innerWidth),
  );
  const toggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
    writeSidebarOpen(window.localStorage, !isSidebarOpen);
  };

  return (
    <div
      className={`hidden shrink-0 flex-col rounded-md border-2 border-[rgba(0,0,0,0.08)] bg-white text-sm shadow-sm transition-all duration-300 ease-in-out md:flex ${isSidebarOpen ? 'w-64' : 'w-16'}`}
    >
      <div className="flex items-center justify-between p-4">
        <h2
          className={`overflow-hidden text-lg font-bold text-nowrap transition-all duration-300 ease-in-out ${isSidebarOpen ? 'opacity-100' : 'w-0 opacity-0'}`}
        >
          Prospera
        </h2>
        <button
          onClick={toggle}
          aria-label={isSidebarOpen ? 'Згорнути меню' : 'Розгорнути меню'}
          className="cursor-pointer rounded-lg p-1 transition-colors duration-300 ease-in-out hover:bg-[#f3f5f7]"
        >
          {isSidebarOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
        </button>
      </div>
      <NavList isOpen={isSidebarOpen} />
    </div>
  );
}
