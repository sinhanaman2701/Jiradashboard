interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const projectCache = new Map<string, CacheEntry<unknown>>();
const issueSearchCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(cache: Map<string, CacheEntry<unknown>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(cache: Map<string, CacheEntry<unknown>>, key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function getCachedProjects<T>(key: string): T | null {
  return getCached<T>(projectCache, key);
}

export function setCachedProjects<T>(key: string, value: T): T {
  return setCached(projectCache, key, value, 15 * 60 * 1000);
}

export function getCachedIssueSearch<T>(key: string): T | null {
  return getCached<T>(issueSearchCache, key);
}

export function setCachedIssueSearch<T>(key: string, value: T): T {
  return setCached(issueSearchCache, key, value, 2 * 60 * 1000);
}

export function clearIssueSearchCacheForUser(accountId: string): void {
  const prefix = `${accountId}:`;
  for (const key of issueSearchCache.keys()) {
    if (key.startsWith(prefix)) {
      issueSearchCache.delete(key);
    }
  }
}
