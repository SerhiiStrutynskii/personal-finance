import { MutationObserver, QueryObserver, focusManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFETCH_ON_RETURN_AFTER_MS, createQueryClient } from './queryClient.ts';

describe('createQueryClient', () => {
  it('після успішної мутації перечитує дані, але не сесію', async () => {
    const queryClient = createQueryClient();
    const calls = { accounts: 0, me: 0 };
    const accounts = new QueryObserver(queryClient, {
      queryKey: ['accounts'],
      queryFn: () => ++calls.accounts,
    });
    const me = new QueryObserver(queryClient, {
      queryKey: ['me'],
      queryFn: () => ++calls.me,
      staleTime: 'static',
    });
    const unsubscribe = [accounts.subscribe(() => {}), me.subscribe(() => {})];
    await Promise.all([accounts.refetch(), me.refetch()]);
    calls.accounts = calls.me = 0;

    await new MutationObserver(queryClient, { mutationFn: async () => 'ok' }).mutate();

    expect(calls).toEqual({ accounts: 1, me: 0 });
    unsubscribe.forEach((stop) => stop());
    queryClient.clear();
  });

  it('свіжі дані не перечитуються при повторному монтуванні', async () => {
    const queryClient = createQueryClient();
    let calls = 0;
    const options = { queryKey: ['categories'], queryFn: () => ++calls };
    await queryClient.fetchQuery(options);

    const observer = new QueryObserver(queryClient, options);
    const stop = observer.subscribe(() => {});

    expect(calls).toBe(1);
    expect(observer.getCurrentResult().data).toBe(1);
    stop();
    queryClient.clear();
  });

  describe('повернення на сторінку', () => {
    afterEach(() => {
      focusManager.setFocused(undefined);
      vi.useRealTimers();
    });

    /** Дані відкритої сторінки й сесія, завантажені щойно. */
    async function openPage() {
      const queryClient = createQueryClient();
      // Підписку на фокус вікна вмикає QueryClientProvider; тут — вручну.
      queryClient.mount();
      const calls = { accounts: 0, me: 0 };
      const observers = [
        new QueryObserver(queryClient, { queryKey: ['accounts'], queryFn: () => ++calls.accounts }),
        new QueryObserver(queryClient, {
          queryKey: ['me'],
          queryFn: () => ++calls.me,
          staleTime: 'static',
        }),
      ];
      const stops = observers.map((observer) => observer.subscribe(() => {}));
      await Promise.all(observers.map((observer) => observer.refetch()));
      calls.accounts = calls.me = 0;
      return {
        calls,
        /** Вкладку сховали й повернулися до неї. */
        async returnToTab() {
          focusManager.setFocused(false);
          focusManager.setFocused(true);
          await vi.runAllTimersAsync();
        },
        close() {
          stops.forEach((stop) => stop());
          queryClient.clear();
          queryClient.unmount();
        },
      };
    }

    it('щойно завантажені дані не перечитуються', async () => {
      vi.useFakeTimers();
      const page = await openPage();
      vi.advanceTimersByTime(REFETCH_ON_RETURN_AFTER_MS - 1000);
      await page.returnToTab();
      expect(page.calls).toEqual({ accounts: 0, me: 0 });
      page.close();
    });

    it('старші за поріг дані перечитуються, хоч і свіжі для кешу; сесія — ні', async () => {
      vi.useFakeTimers();
      const page = await openPage();
      vi.advanceTimersByTime(REFETCH_ON_RETURN_AFTER_MS + 1000);
      await page.returnToTab();
      expect(page.calls).toEqual({ accounts: 1, me: 0 });
      page.close();
    });
  });
});
