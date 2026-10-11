import { Calculator, ChartArea, HandCoins, Home, Menu, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import type { ISidebarItem } from '../../Entities/Sidebar/Models/SidebarItem';
import { SidebarItem,  } from '../../Entities/Sidebar/Ui/SidebarItem';
import { NavLink } from 'react-router-dom';

export function Sidebar() {

 const navItems: ISidebarItem[] = [
    { title: 'Головна', 
      icon: Home, 
      route: '/',
      hasDropdown: false },
    { 
      title: 'Витрати', 
      icon: HandCoins,
      hasDropdown: false,
      route: '/expenses',
  
    },
    { 
      title: 'Доходи', 
      icon: Wallet,
      hasDropdown: false,
      route: '/incomes',
    },
    { 
      title: 'Бюджет', 
      icon: Calculator,
      hasDropdown: false,
      route: '/budget',
    },
    { 
      title: 'Борги', 
      icon: Wallet,
      hasDropdown: false,
      route: '/debts',
    },
    { title: 'Аналітика', icon: ChartArea, hasDropdown: false, route: '/analytics' },
  
  ];
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(navItems[0].title);
  return (
      <div className={`bg-white text-blck transition-all duration-300 ease-in-out  text-sm border-2 rounded-md border-[rgba(0,0,0,0.08)] shadow-sm ${isSidebarOpen ? 'w-64' : 'w-16'}`}>
        <div className="flex p-4 items-center justify-between">
          <h2 className={`font-bold overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'opacity-100' : 'opacity-0'} text-lg text-nowrap`}>Prospera</h2>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hover:bg-[#f3f5f7] p-1 rounded-lg cursor-pointer transition-colors duration-300 ease-in-out"
          >
            {isSidebarOpen ? <X size={20} strokeWidth={1.5}/> : <Menu size={20} strokeWidth={1.5}/>}
          </button>
        </div>
        <div className={`transition-all duration-300 ease-in-out  mt-6`}>   
        {navItems.map((item) => (
          item.hasDropdown ? (
            <SidebarItem 
              key={item.title}
              item={item} 
              isOpen={isSidebarOpen}
              activeDropdown={activeDropdown} 
              setActiveDropdown={setActiveDropdown}
            />
          ) : (
            <NavLink 
                key={item.title}
                to={item.route || '#'} 
                className="block bg-transparent aria-[current=page]:bg-[#F3F5F7]"
            >
                <SidebarItem 
                key={item.title}
                item={item} 
                isOpen={isSidebarOpen}
                activeDropdown={activeDropdown} 
                setActiveDropdown={setActiveDropdown}
              />
            </NavLink>
          )
        ))}
        </div>
      </div>
  );
} 

export default Sidebar;