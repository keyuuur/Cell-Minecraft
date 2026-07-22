import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openDbMock } = vi.hoisted(() => ({ openDbMock: vi.fn() }));

vi.mock('idb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('idb')>()),
  openDB: openDbMock,
}));

import { closeCellGameDatabase, openCellGameDatabase } from './schema';

function fakeDatabase() {
  return { close: vi.fn() };
}

describe('shared IndexedDB connection recovery', () => {
  beforeEach(() => {
    closeCellGameDatabase();
    openDbMock.mockReset();
  });

  it('does not cache a rejected open promise', async () => {
    const recovered = fakeDatabase();
    openDbMock.mockRejectedValueOnce(new Error('OPEN_FAILED')).mockResolvedValueOnce(recovered);
    await expect(openCellGameDatabase()).rejects.toThrow(/OPEN_FAILED/);
    await expect(openCellGameDatabase()).resolves.toBe(recovered);
    expect(openDbMock).toHaveBeenCalledTimes(2);
  });

  it('closes a superseded late connection without losing the newer active connection', async () => {
    const stale = fakeDatabase();
    const current = fakeDatabase();
    let resolveStale: ((value: unknown) => void) | undefined;
    openDbMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce(current);

    const staleOpen = openCellGameDatabase();
    closeCellGameDatabase();
    await expect(openCellGameDatabase()).resolves.toBe(current);
    resolveStale?.(stale);
    await expect(staleOpen).rejects.toThrow(/INDEXED_DB_OPEN_SUPERSEDED/);
    expect(stale.close).toHaveBeenCalledOnce();
    closeCellGameDatabase();
    expect(current.close).toHaveBeenCalledOnce();
  });
});
