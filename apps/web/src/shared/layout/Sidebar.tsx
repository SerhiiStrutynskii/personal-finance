import {
  Calculator,
  ChartArea,
  CreditCard,
  HandCoins,
  Home,
  LogOut,
  Menu,
  Tags,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/authContext.ts';
import type { ISidebarItem } from './sidebarItemModel.ts';
import { SidebarItem } from './SidebarItem.tsx';

const navItems: ISidebarItem[] = [
  { title: 'Головна', icon: Home, route: '/', hasDropdown: false },
  { title: 'Витрати', icon: HandCoins, route: '/expenses', hasDropdown: false },
  { title: 'Доходи', icon: TrendingUp, route: '/incomes', hasDropdown: false },
  { title: 'Рахунки', icon: CreditCard, route: '/accounts', hasDropdown: false },
  { title: 'Категорії', icon: Tags, route: '/categories', hasDropdown: false },
  { title: 'Бюджет', icon: Calculator, route: '/budget', hasDropdown: false },
  { title: 'Борги', icon: Wallet, route: '/debts', hasDropdown: false },
  { title: 'Аналітика', icon: ChartArea, route: '/analytics', hasDropdown: false },
];

export function Sidebar() {
  const { current, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  return (
    <div
      className={`flex shrink-0 flex-col rounded-md border-2 border-[rgba(0,0,0,0.08)] bg-white text-sm shadow-sm transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-16'}`}
    >
      <div className="flex items-center justify-between p-4">
        <h2
          className={`overflow-hidden text-lg font-bold text-nowrap transition-all duration-300 ease-in-out ${isSidebarOpen ? 'opacity-100' : 'w-0 opacity-0'}`}
        >
          Prospera
        </h2>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          aria-label={isSidebarOpen ? 'Згорнути меню' : 'Розгорнути меню'}
          className="cursor-pointer rounded-lg p-1 transition-colors duration-300 ease-in-out hover:bg-[#f3f5f7]"
        >
          {isSidebarOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
        </button>
      </div>
      <nav className="mt-6 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.route ?? '#'}
            end={item.route === '/'}
            title={item.title}
            className="block bg-transparent aria-[current=page]:bg-[#F3F5F7]"
          >
            <SidebarItem
              item={item}
              isOpen={isSidebarOpen}
              activeDropdown={activeDropdown}
              setActiveDropdown={setActiveDropdown}
            />
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-black/10">
        {isSidebarOpen && current && (
          <div className="px-4 pt-3">
            <div className="truncate">{current.user.name}</div>
            <div className="truncate text-xs text-black/50">{current.household.name}</div>
          </div>
        )}
        <button className="block w-full text-left" onClick={logout} title="Вийти">
          <SidebarItem
            item={{ title: 'Вийти', icon: LogOut, hasDropdown: false }}
            isOpen={isSidebarOpen}
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
          />
        </button>
      </div>
    </div>
  );
}
