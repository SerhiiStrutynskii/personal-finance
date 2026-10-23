import { Menu, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { currentNavItem } from './navItems.ts';
import { NavList } from './NavList.tsx';

const DESKTOP_QUERY = '(min-width: 48rem)';

/** Верхня панель і висувне меню для телефона (вужче за md). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const section = currentNavItem(pathname);

  // Екран розширився до сайдбара (поворот планшета) — висувне меню більше не потрібне.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const close = () => query.matches && setOpen(false);
    query.addEventListener('change', close);
    return () => query.removeEventListener('change', close);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <header className="flex shrink-0 items-center gap-2 border-b border-black/10 bg-white px-2 py-2 md:hidden">
        <DialogPrimitive.Trigger
          aria-label="Відкрити меню"
          className="cursor-pointer rounded-lg p-2 hover:bg-[#f3f5f7]"
        >
          <Menu size={22} strokeWidth={1.5} />
        </DialogPrimitive.Trigger>
        <span className="font-bold">Prospera</span>
        {section && (
          <span className="min-w-0 truncate text-sm text-black/60">· {section.title}</span>
        )}
      </header>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 md:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white text-sm shadow-lg outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left md:hidden"
        >
          <div className="flex items-center justify-between p-4">
            <DialogPrimitive.Title className="text-lg font-bold">Prospera</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Закрити меню"
              className="cursor-pointer rounded-lg p-1 hover:bg-[#f3f5f7]"
            >
              <X size={20} strokeWidth={1.5} />
            </DialogPrimitive.Close>
          </div>
          <NavList isOpen onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
