/**
 * Ключ назви продукту для порівняння: без пробілів по краях і в нижньому регістрі за правилами
 * української. «Молоко» і « МОЛОКО » — той самий продукт.
 */
export function productNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('uk');
}

const collator = new Intl.Collator('uk', { sensitivity: 'base' });

/** Порівняння назв за українським алфавітом без урахування регістру, для сортування. */
export function compareProductNames(a: string, b: string): number {
  return collator.compare(a, b);
}
