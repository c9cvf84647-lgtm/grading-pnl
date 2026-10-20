import { Redis } from "@upstash/redis";

// Thin key-value layer. Uses Upstash Redis (Vercel's free Redis integration) when its
// env vars are present, and an in-memory map for local development otherwise.

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hset(key: string, field: string, value: unknown): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
}

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function redisStore(redis: Redis): Store {
  return {
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
      else await redis.set(key, value);
    },
    async del(key) {
      await redis.del(key);
    },
    async incr(key, ttlSeconds) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttlSeconds);
      return n;
    },
    async hgetall<T>(key: string) {
      return ((await redis.hgetall<Record<string, T>>(key)) ?? {}) as Record<string, T>;
    },
    async hset(key, field, value) {
      await redis.hset(key, { [field]: value });
    },
    async hdel(key, field) {
      await redis.hdel(key, field);
    },
  };
}

type Entry = { value: unknown; expires?: number };
const globalMem = globalThis as unknown as { __memStore?: Map<string, Entry> };

function memoryStore(): Store {
  const mem = (globalMem.__memStore ??= new Map<string, Entry>());
  const read = (key: string) => {
    const e = mem.get(key);
    if (e?.expires && e.expires < Date.now()) {
      mem.delete(key);
      return undefined;
    }
    return e?.value;
  };
  const clone = <T>(v: unknown) => (v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T));
  return {
    async get<T>(key: string) {
      return clone<T>(read(key));
    },
    async set(key, value, ttlSeconds) {
      mem.set(key, { value: clone(value), expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
    },
    async del(key) {
      mem.delete(key);
    },
    async incr(key, ttlSeconds) {
      const n = ((read(key) as number) || 0) + 1;
      mem.set(key, { value: n, expires: n === 1 ? Date.now() + ttlSeconds * 1000 : mem.get(key)?.expires });
      return n;
    },
    async hgetall<T>(key: string) {
      return (clone<Record<string, T>>(read(key)) ?? {}) as Record<string, T>;
    },
    async hset(key, field, value) {
      const h = (read(key) as Record<string, unknown>) || {};
      h[field] = clone(value);
      mem.set(key, { value: h });
    },
    async hdel(key, field) {
      const h = read(key) as Record<string, unknown> | undefined;
      if (h) delete h[field];
    },
  };
}

export const hasDatabase = Boolean(url && token);
export const store: Store = hasDatabase ? redisStore(new Redis({ url: url!, token: token! })) : memoryStore();
