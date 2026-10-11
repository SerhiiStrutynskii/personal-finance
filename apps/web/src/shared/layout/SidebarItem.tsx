import { ChevronDown } from 'lucide-react';
import type { ISidebarItem } from './sidebarItemModel.ts';

export function SidebarItem({
  item,
  isOpen,
  activeDropdown,
  setActiveDropdown,
}: {
  item: ISidebarItem;
  isOpen: boolean;
  activeDropdown: string | null;
  setActiveDropdown: (title: string) => void;
}) {
  const Icon = item.icon;
  return (
    <div key={item.title}>
      <div
        className={`px-4 py-3 hover:bg-[#F3F5F7] cursor-pointer flex items-center justify-between bg-[${activeDropdown === item.title ? 'rgba(0,0,0,0.05)' : 'transparent'}] transition-colors duration-300`}
        onClick={() =>
          item.hasDropdown &&
          isOpen &&
          setActiveDropdown(activeDropdown === item.title ? '' : item.title)
        }
      >
        <div className="flex items-center">
          {Icon && <Icon size={20} strokeWidth={1.5} color="#000" />}
          <span
            className={`ml-4 whitespace-nowrap overflow-hidden transition-all duration-300
                  ${isOpen ? 'w-32 opacity-100' : 'w-0 opacity-0'}`}
          >
            {item.title}
          </span>
        </div>
        {item.hasDropdown && isOpen && (
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className={`transition-transform duration-200 
                    ${activeDropdown === item.title ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {item.hasDropdown && isOpen && activeDropdown === item.title && (
        <div className="bg-[#f5f5f5] overflow-hidden transition-all duration-200">
          {item.subItems?.map((dropdownItem) => (
            <div
              key={dropdownItem.title}
              className="px-11 py-2 hover:bg-[#f1f1f1] cursor-pointer text-sm"
            >
              {dropdownItem.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
