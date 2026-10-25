// Adapted from Pulse (src/lib/storageAdapter.ts). Keeps each keychain value
// below historical iOS size limits; two banks let an interrupted write keep
// the previous value.
export type StringStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function createChunkedStorage(store: StringStorage, namespace = 'core.secure'): StringStorage {
  let pending: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const result = pending.then(action);
    pending = result.catch(() => undefined);
    return result;
  };
  const base = (key: string) => `${namespace}.${Array.from(key).map(c => c.codePointAt(0)!.toString(16)).join('_')}`;
  async function manifest(key: string): Promise<{ bank: number; count: number } | null> {
    const raw = await store.getItem(`${key}.manifest`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (![0, 1].includes(parsed.bank) || !Number.isInteger(parsed.count) || parsed.count < 0 || parsed.count > 10000) {
      throw new Error('Private storage is damaged.');
    }
    return parsed;
  }
  async function bankCount(prefix: string, bank: number, fallback = 0) {
    const raw = await store.getItem(`${prefix}.${bank}.count`);
    const count = raw === null ? fallback : Number(raw);
    if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error('Private storage is damaged.');
    return count;
  }
  return {
    getItem: key => serial(async () => {
      const prefix = base(key);
      const head = await manifest(prefix);
      if (!head) return null;
      const chunks: string[] = [];
      for (let i = 0; i < head.count; i++) {
        const chunk = await store.getItem(`${prefix}.${head.bank}.${i}`);
        if (chunk === null) throw new Error('Private storage is incomplete.');
        chunks.push(chunk);
      }
      return chunks.join('');
    }),
    setItem: (key, value) => serial(async () => {
      const prefix = base(key);
      const previous = await manifest(prefix);
      const bank = previous?.bank === 0 ? 1 : 0;
      const characters = Array.from(value);
      const count = Math.ceil(characters.length / 400);
      if (count > 10000) throw new Error('Private storage capacity exceeded.');
      const staleCount = await bankCount(prefix, bank);
      await store.setItem(`${prefix}.${bank}.count`, String(Math.max(count, staleCount)));
      for (let i = 0; i < count; i++) {
        await store.setItem(`${prefix}.${bank}.${i}`, characters.slice(i * 400, (i + 1) * 400).join(''));
      }
      for (let i = count; i < staleCount; i++) await store.removeItem(`${prefix}.${bank}.${i}`);
      await store.setItem(`${prefix}.${bank}.count`, String(count));
      await store.setItem(`${prefix}.manifest`, JSON.stringify({ bank, count }));
      if (previous) {
        for (let i = 0; i < previous.count; i++) await store.removeItem(`${prefix}.${previous.bank}.${i}`);
        await store.removeItem(`${prefix}.${previous.bank}.count`);
      }
    }),
    removeItem: key => serial(async () => {
      const prefix = base(key);
      const previous = await manifest(prefix);
      for (const bank of [0, 1]) {
        const count = await bankCount(prefix, bank, previous?.bank === bank ? previous.count : 0);
        for (let i = 0; i < count; i++) await store.removeItem(`${prefix}.${bank}.${i}`);
        await store.removeItem(`${prefix}.${bank}.count`);
      }
      await store.removeItem(`${prefix}.manifest`);
    }),
  };
}
