import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncLruCache } from "../utils/async_lru_cache.js";

test("async cache reuses a fresh value", async () => {
  const cache = createTestCache();
  let loads = 0;
  const load = async () => ++loads;

  const first = await cache.get("player", { load });
  const second = await cache.get("player", { load });

  assert.equal(first.value, 1);
  assert.equal(first.status, "miss");
  assert.equal(second.value, 1);
  assert.equal(second.status, "hit");
  assert.equal(loads, 1);
});

test("async cache coalesces concurrent loads for one key", async () => {
  const cache = createTestCache();
  const pending = deferred();
  let loads = 0;
  const load = async () => {
    loads++;
    return pending.promise;
  };

  const firstPromise = cache.get("player", { load });
  const secondPromise = cache.get("player", { load });
  await Promise.resolve();
  pending.resolve("shared");

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.equal(first.value, "shared");
  assert.equal(second.value, "shared");
  assert.equal(loads, 1);
  assert.deepEqual(
    new Set([first.status, second.status]),
    new Set(["miss", "coalesced"]),
  );
});

test("async cache returns stale data while refreshing in the background", async () => {
  const cache = createTestCache({ ttlMs: 50 });
  await cache.get("player", { load: async () => "old" });
  await delay(65);

  const refresh = deferred();
  const stale = await cache.get("player", {
    load: async () => refresh.promise,
  });

  assert.equal(stale.value, "old");
  assert.equal(stale.status, "stale");

  refresh.resolve("new");
  await delay(5);
  const fresh = await cache.get("player", { load: async () => "unused" });
  assert.equal(fresh.value, "new");
  assert.equal(fresh.status, "hit");
});

test("async cache retains stale data when a background refresh fails", async () => {
  const cache = createTestCache({ ttlMs: 20 });
  await cache.get("player", { load: async () => "old" });
  await delay(30);

  const stale = await cache.get("player", {
    load: async () => {
      throw new Error("upstream unavailable");
    },
  });

  assert.equal(stale.value, "old");
  assert.equal(stale.status, "stale");
  await delay(5);

  const retained = await cache.get("player", {
    load: async () => "replacement",
  });
  assert.equal(retained.value, "old");
  assert.equal(retained.status, "stale");
});

test("async cache discards data beyond the maximum stale age", async () => {
  const cache = createTestCache({ ttlMs: 5, maxStaleMs: 10 });
  await cache.get("player", { load: async () => "old" });
  await delay(20);

  const refreshed = await cache.get("player", { load: async () => "new" });
  assert.equal(refreshed.value, "new");
  assert.equal(refreshed.status, "miss");
});

test("one caller aborting does not cancel a coalesced load", async () => {
  const cache = createTestCache();
  const pending = deferred();
  const controller = new AbortController();
  const load = async () => pending.promise;

  const aborted = cache.get("player", { load, signal: controller.signal });
  const shared = cache.get("player", { load });
  controller.abort("viewer disconnected");
  pending.resolve("completed");

  await assert.rejects(aborted, { name: "AbortError" });
  assert.equal((await shared).value, "completed");
});

test("async cache applies a timeout to its loader", async () => {
  const cache = createTestCache({ loadTimeoutMs: 10 });
  const keepEventLoopAlive = delay(20);

  await assert.rejects(
    cache.get("player", {
      load: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    }),
    /timed out after 10ms/,
  );
  await keepEventLoopAlive;
});

function createTestCache(options = {}) {
  return createAsyncLruCache({
    max: 10,
    ttlMs: 1_000,
    maxStaleMs: 5_000,
    loadTimeoutMs: 1_000,
    ...options,
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
