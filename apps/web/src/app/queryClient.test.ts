import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from './queryClient.ts';

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
});
