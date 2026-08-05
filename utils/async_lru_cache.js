import { LRUCache } from "lru-cache";

export function createAsyncLruCache(options = {}) {
  const max = positiveInteger(options.max, 500);
  const ttlMs = positiveNumber(options.ttlMs, 15_000);
  const maxStaleMs = positiveNumber(options.maxStaleMs, 120_000);
  const loadTimeoutMs = positiveNumber(options.loadTimeoutMs, 10_000);

  const cache = new LRUCache({
    max,
    ttl: ttlMs,
    allowStale: true,
    noDeleteOnStaleGet: true,
    noDeleteOnFetchRejection: true,
    fetchMethod: async (key, staleEntry, { signal, context }) => {
      const timeoutSignal = AbortSignal.timeout(loadTimeoutMs);
      const loadSignal = AbortSignal.any([signal, timeoutSignal]);
      let value;

      try {
        value = await context.load({ signal: loadSignal, staleEntry });
      } catch (error) {
        if (timeoutSignal.aborted && !signal.aborted) {
          throw new Error(`Cache loader timed out after ${loadTimeoutMs}ms`);
        }

        throw error;
      }

      return {
        value,
        fetchedAt: Date.now(),
      };
    },
  });

  return {
    async get(key, { load, signal } = {}) {
      if (typeof load !== "function") {
        throw new TypeError("A cache loader is required");
      }

      const cachedEntry = cache.peek(key, { allowStale: true });
      if (
        cachedEntry &&
        Date.now() - cachedEntry.fetchedAt > maxStaleMs
      ) {
        cache.delete(key);
      }

      const status = {};
      const fetchPromise = cache.fetch(key, {
        allowStale: true,
        context: { load },
        status,
      });
      const entry = await waitForPromiseOrAbort(fetchPromise, signal);

      if (!entry) {
        throw status.fetchError || new Error("Cache loader returned no data");
      }

      return {
        value: entry.value,
        status: cacheStatus(status),
        ageMs: Math.max(0, Date.now() - entry.fetchedAt),
      };
    },

    clear() {
      cache.clear();
    },

    get size() {
      return cache.size;
    },
  };
}

function cacheStatus(status) {
  if (status.returnedStale || status.fetch === "stale") {
    return "stale";
  }

  if (status.fetch === "hit") {
    return "hit";
  }

  if (status.fetch === "inflight") {
    return "coalesced";
  }

  return "miss";
}

function waitForPromiseOrAbort(promise, signal) {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError(signal.reason));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function createAbortError(reason) {
  const error = new Error(reason || "aborted");
  error.name = "AbortError";
  return error;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
