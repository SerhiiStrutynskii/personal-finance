import { formatMoney } from '@hf/shared';

/** Сума зі знаком: «+1 500,00 грн», «−300,00 грн», а нуль — без знака. */
export function signedMoney(amountMinor: number, currency: string): string {
  const text = formatMoney({ amountMinor: Math.abs(amountMinor), currency });
  if (amountMinor === 0) return text;
  return `${amountMinor > 0 ? '+' : '−'}${text}`;
}
