/**
 * An in-memory stand-in for the Devvit Redis client, covering only the commands
 * TaaraNight uses. Test-only — it lets the store be exercised without a Devvit
 * runtime or a Redis server.
 *
 * Semantics deliberately mirror the real client: `hGetAll` returns `{}` for a
 * missing key, `mGet` yields nulls for missing keys, and `zRange` by rank
 * sorts on score (ties broken lexicographically by member, as Redis does).
 */

import type { RedisLike } from './records';

type ZEntry = { member: string; score: number };

export function createFakeRedis(): RedisLike & { dump(): Record<string, unknown> } {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();

  function sorted(key: string): ZEntry[] {
    const set = zsets.get(key);
    if (!set) return [];
    return [...set.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => (a.score === b.score ? a.member.localeCompare(b.member) : a.score - b.score));
  }

  return {
    async get(key: string): Promise<string | undefined> {
      return strings.get(key);
    },

    async set(key: string, value: string): Promise<string> {
      strings.set(key, value);
      return 'OK';
    },

    async mGet(keys: string[]): Promise<(string | null)[]> {
      return keys.map((key) => strings.get(key) ?? null);
    },

    async incrBy(key: string, value: number): Promise<number> {
      const next = Number.parseInt(strings.get(key) ?? '0', 10) + value;
      strings.set(key, String(next));
      return next;
    },

    async hGetAll(key: string): Promise<Record<string, string>> {
      const hash = hashes.get(key);
      return hash ? Object.fromEntries(hash) : {};
    },

    async hSet(key: string, fieldValues: { [field: string]: string }): Promise<number> {
      const hash = hashes.get(key) ?? new Map<string, string>();
      hashes.set(key, hash);
      let added = 0;
      for (const [field, value] of Object.entries(fieldValues)) {
        if (!hash.has(field)) added++;
        hash.set(field, value);
      }
      return added;
    },

    async zAdd(key: string, ...members: ZEntry[]): Promise<number> {
      const set = zsets.get(key) ?? new Map<string, number>();
      zsets.set(key, set);
      let added = 0;
      for (const { member, score } of members) {
        if (!set.has(member)) added++;
        set.set(member, score);
      }
      return added;
    },

    async zRange(
      key: string,
      start: number | string,
      stop: number | string,
      options?: { by: 'score' | 'lex' | 'rank'; reverse?: boolean }
    ): Promise<ZEntry[]> {
      if (options?.by !== 'rank') throw new Error(`fakeRedis.zRange supports by:"rank" only`);

      const rows = options.reverse ? sorted(key).reverse() : sorted(key);
      const from = Number(start);
      const to = Number(stop);
      // Redis ranges are inclusive, and -1 means "through the end".
      return rows.slice(from, to === -1 ? undefined : to + 1);
    },

    dump() {
      return {
        strings: Object.fromEntries(strings),
        hashes: Object.fromEntries([...hashes].map(([k, v]) => [k, Object.fromEntries(v)])),
        zsets: Object.fromEntries([...zsets].map(([k, v]) => [k, Object.fromEntries(v)])),
      };
    },
  };
}
