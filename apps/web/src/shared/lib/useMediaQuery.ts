import { useSyncExternalStore } from 'react';

/** Чи відповідає екран медіазапиту; оновлюється під час зміни розміру вікна. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Ширина від планшета (md у Tailwind): є сайдбар і місце для таблиць. */
export const WIDE_SCREEN = '(min-width: 48rem)';
