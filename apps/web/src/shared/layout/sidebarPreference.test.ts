import { describe, expect, it } from 'vitest';
import { initialSidebarOpen, readSidebarOpen, writeSidebarOpen } from './sidebarPreference.ts';

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};
const broken = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('sidebarPreference', () => {
  it('без збереженого вибору: розгорнутий на десктопі, згорнутий на планшеті', () => {
    expect(initialSidebarOpen(memory(), 1440)).toBe(true);
    expect(initialSidebarOpen(memory(), 1024)).toBe(true);
    expect(initialSidebarOpen(memory(), 900)).toBe(false);
  });

  it('збережений вибір переважає ширину екрана', () => {
    const storage = memory();
    writeSidebarOpen(storage, false);
    expect(initialSidebarOpen(storage, 1440)).toBe(false);
    writeSidebarOpen(storage, true);
    expect(initialSidebarOpen(storage, 900)).toBe(true);
  });

  it('недоступне сховище не ламає меню', () => {
    expect(readSidebarOpen(broken)).toBeNull();
    expect(() => writeSidebarOpen(broken, true)).not.toThrow();
    expect(initialSidebarOpen(broken, 1440)).toBe(true);
  });
});
