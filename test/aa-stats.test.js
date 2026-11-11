import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createAAStatsRouter, fetchAAStats } from "../routes/aaStats.js";

const now = new Date("2026-11-09T20:00:00Z");
const start = new Date("2026-11-09T19:00:00Z");
const uuid = "9a8e24df-4c85-49d6-96a6-951da84fa5c4";
const run = (id, minutes, splits = {}) => ({
  id, lastUpdated: now.getTime() - minutes * 60000,
  nether: null, elytra: null, finish: null, ...splits,
});
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test("AA stats follows cursors, deduplicates runs, and includes the window boundary", async () => {
  const urls = [];
  const pages = [
    { rows: [run(5, 5, { nether: 200000, elytra: 900000 }), run(4, 20)], nextCursor: 4, hasMore: true },
    { rows: [run(4, 20), run(3, 60, { nether: 1 }), run(2, 61, { nether: 1 })], nextCursor: 2, hasMore: true },
  ];
  const stats = await fetchAAStats(uuid, start, {
    now,
    fetchImpl: async (url) => { urls.push(new URL(url)); return response(pages.shift()); },
  });
  assert.deepEqual(stats, { nethers: 2, elytras: 1, finished: 0 });
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get("limit"), "100");
  assert.equal(urls[1].searchParams.get("beforeId"), "4");
});

test("AA finished counts only positive finish splits inside the stream window", async () => {
  const rows = [
    run(8, 1, { finish: 7200000 }),
    run(7, 2, { credits: 1200000 }),
    run(6, 3, { finish: 0 }),
    run(5, 4, { finish: -1 }),
    run(4, 5, { finish: "7200000" }),
    run(3, 60, { finish: 7300000 }),
    run(2, 61, { finish: 7400000 }),
    run(8, 1, { finish: 7200000 }),
  ];
  const stats = await fetchAAStats(uuid, start, {
    now, fetchImpl: async () => response({ rows, hasMore: false }),
  });
  assert.equal(stats.finished, 2);
});

test("AA stats returns zero for no runs and rejects failed or stalled upstream pages", async () => {
  assert.deepEqual(await fetchAAStats(uuid, start, {
    fetchImpl: async () => response({ rows: [], hasMore: false }),
  }), { nethers: 0, elytras: 0, finished: 0 });
  for (const data of [{}, { rows: [], hasMore: true, nextCursor: 4 }]) {
    await assert.rejects(fetchAAStats(uuid, start, { fetchImpl: async () => response(data) }));
  }
  await assert.rejects(fetchAAStats(uuid, start, {
    now, fetchImpl: async () => response({ rows: [run(4, 20)], hasMore: true, nextCursor: 4 }),
  }), /did not advance/);
  await assert.rejects(fetchAAStats(uuid, start, { fetchImpl: async () => response({}, 429) }), /429/);
});

test("AA route validates input, resolves Mojang profiles, supports UUIDs, and handles errors", async (t) => {
  let calls = [];
  let playerStatus = 200;
  let pacemanStatus = 200;
  const app = express();
  app.use("/api/aa/stats", createAAStatsRouter({
    now: () => now,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("mojang.com")) return response({ id: uuid.replaceAll("-", "") }, playerStatus);
      return response({ rows: [run(1, 5, { nether: 100, elytra: 500, finish: 1000 })], hasMore: false }, pacemanStatus);
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = async (query) => {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/aa/stats?${new URLSearchParams(query)}`);
    return { status: result.status, data: await result.json() };
  };
  for (const query of [{}, { username: "bad/name" }, { uuid: "bad" }, { username: "Feinberg", timeframe: "-1 hour" }, { username: "Feinberg", timeframe: "[Error: Stream is offline.]" }]) {
    assert.equal((await request(query)).status, 400);
  }
  assert.equal(calls.length, 0);
  const result = await request({ username: "Feinberg", timeframe: "1 hour" });
  assert.equal(result.status, 200);
  assert.equal(result.data.startTime, start.toISOString());
  assert.equal(result.data.elytras, 1);
  assert.equal(result.data.finished, 1);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.get("uuid"), uuid);
  calls = [];
  const direct = await request({ uuid });
  assert.equal(direct.status, 200);
  assert.equal(direct.data.timeframe, "24 hours");
  assert.equal(calls.length, 1);
  playerStatus = 404;
  assert.equal((await request({ username: "Missing" })).status, 404);
  pacemanStatus = 500;
  assert.equal((await request({ uuid })).status, 502);
});
