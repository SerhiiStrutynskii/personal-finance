import type { LucideIcon } from 'lucide-react';

export function SidebarItem({
  title,
  icon: Icon,
  isOpen,
}: {
  title: string;
  icon: LucideIcon;
  isOpen: boolean;
}) {
  return (
    <div className="flex cursor-pointer items-center px-4 py-3 transition-colors duration-300 hover:bg-[#F3F5F7]">
      <Icon size={20} strokeWidth={1.5} color="#000" aria-hidden />
      <span
        className={`ml-4 overflow-hidden whitespace-nowrap transition-all duration-300 ${isOpen ? 'w-32 opacity-100' : 'w-0 opacity-0'}`}
      >
        {title}
      </span>
    </div>
  );
}
