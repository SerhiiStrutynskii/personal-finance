import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/authContext.ts';
import { navItems } from './navItems.ts';
import { SidebarItem } from './SidebarItem.tsx';

/** Пункти меню, користувач і вихід — спільні для сайдбара й мобільного меню. */
export function NavList({ isOpen, onNavigate }: { isOpen: boolean; onNavigate?: () => void }) {
  const { current, logout } = useAuth();
  return (
    <>
      <nav className="mt-6 flex-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.route}
            to={item.route}
            end={item.route === '/'}
            title={item.title}
            onClick={onNavigate}
            className="block bg-transparent aria-[current=page]:bg-[#F3F5F7]"
          >
            <SidebarItem title={item.title} icon={item.icon} isOpen={isOpen} />
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-black/10">
        {isOpen && current && (
          <div className="px-4 pt-3">
            <div className="truncate">{current.user.name}</div>
            <div className="truncate text-xs text-black/50">{current.household.name}</div>
          </div>
        )}
        <button className="block w-full text-left" onClick={logout} title="Вийти">
          <SidebarItem title="Вийти" icon={LogOut} isOpen={isOpen} />
        </button>
      </div>
    </>
  );
}
