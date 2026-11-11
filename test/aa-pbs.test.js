import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createAAPbsRouter, fetchAAPbs } from "../routes/aaPbs.js";

const uuid = "9a8e24df-4c85-49d6-96a6-951da84fa5c4";
const now = new Date("2026-11-09T20:00:00Z");
const run = (id, splits = {}) => ({ id, lastUpdated: Date.parse("2025-01-01T00:00:00Z"), ...splits });
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test("AA PBs scan lifetime pages and take independent minima for every split", async () => {
  const urls = [];
  const pages = [
    { rows: [run(5, { nether: 200000, bastion: 300000, fortress: 450000, stronghold: 600000,
      end: 700000, elytra: 900000, credits: 1300000, finish: 8000000 })], hasMore: true, nextCursor: 5 },
    { rows: [run(4, { nether: 150000, elytra: 736999, credits: 1194000, finish: 7548000 }),
      run(3, { nether: 190000, bastion: 250000, fortress: 400000, stronghold: 550000, end: 484000 }),
      run(2, { nether: 0, elytra: -1, finish: "1000" }), run(1, { credits: Infinity })], hasMore: false },
  ];
  const stats = await fetchAAPbs(uuid, { now, fetchImpl: async (url) => {
    urls.push(new URL(url));
    return response(pages.shift());
  } });
  assert.deepEqual(stats, {
    fastestNetherTime: 150000, fastestNetherTimeFormatted: "2:30",
    fastestBastionTime: 250000, fastestBastionTimeFormatted: "4:10",
    fastestFortressTime: 400000, fastestFortressTimeFormatted: "6:40",
    fastestStrongholdTime: 550000, fastestStrongholdTimeFormatted: "9:10",
    fastestEndTime: 484000, fastestEndTimeFormatted: "8:04",
    fastestElytraTime: 736999, fastestElytraTimeFormatted: "12:16",
    fastestEndExitTime: 1194000, fastestEndExitTimeFormatted: "19:54",
    fastestCompletionTime: 7548000, fastestCompletionTimeFormatted: "2:05:48",
  });
  assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get("beforeId"), "5");
});

test("AA PBs return null and None for unreached splits without treating credits as completion", async () => {
  for (const rows of [[], [run(1, { credits: 1200000 })]]) {
    const stats = await fetchAAPbs(uuid, { now, fetchImpl: async () => response({ rows, hasMore: false }) });
    assert.equal(stats.fastestCompletionTime, null);
    assert.equal(stats.fastestCompletionTimeFormatted, "None");
    assert.equal(stats.fastestElytraTime, null);
    assert.equal(stats.fastestElytraTimeFormatted, "None");
    assert.equal(Object.keys(stats).length, 16);
  }
});

test("AA PBs match Paceman's practice-run exclusions", async () => {
  const rows = [
    run(5, { nether: 10000, bastion: 20000 }),
    run(4, { nether: 130000, end: 400000, credits: 500000 }),
    run(3, { nether: 110000, end: 484000, elytra: 736000, credits: 1194000 }),
    run(2, { nether: 120000, bastion: 200000 }),
    run(1, { nether: 160000, end: 550000, elytra: 800000, finish: 7548000 }),
  ];
  const stats = await fetchAAPbs(uuid, { now, fetchImpl: async () => response({ rows, hasMore: false }) });
  assert.equal(stats.fastestNetherTime, 110000);
  assert.equal(stats.fastestBastionTime, 200000);
  assert.equal(stats.fastestEndTime, 484000);
  assert.equal(stats.fastestEndExitTime, 1194000);
  assert.equal(stats.fastestCompletionTime, 7548000);
});

test("AA PBs reject incomplete history rather than return partial records", async () => {
  await assert.rejects(fetchAAPbs(uuid, {
    maxPages: 1, now,
    fetchImpl: async () => response({ rows: [run(2, { finish: 8000000 })], hasMore: true, nextCursor: 2 }),
  }), /page limit/);
  await assert.rejects(fetchAAPbs(uuid, {
    now, fetchImpl: async () => response({ rows: [run(2)], hasMore: true, nextCursor: 2 }),
  }), /did not advance/);
  await assert.rejects(fetchAAPbs(uuid, { fetchImpl: async () => response({}, 429) }), /429/);
});

test("AA PB route resolves usernames, normalizes UUIDs, caches history, and handles bad input/upstream errors", async (t) => {
  const calls = [];
  let status = 200;
  const app = express();
  app.use("/api/aa/pbs", createAAPbsRouter({ now: () => now, fetchImpl: async (url) => {
    calls.push(url);
    if (url.includes("mojang.com")) {
      if (url.endsWith("/Missing")) return response({}, 404);
      if (url.endsWith("/Broken")) return response({}, 500);
      return response({ id: uuid.replaceAll("-", "") });
    }
    return response({ rows: [run(1, { elytra: 736000, finish: 7548000 })], hasMore: false }, status);
  } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = async (query) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/aa/pbs?${new URLSearchParams(query)}`);
    return { status: r.status, body: await r.json() };
  };
  for (const query of [{}, { username: "bad/name" }, { uuid: "bad" }, { uuid, username: "bad/name" }, { username: "Feinberg", timeframe: "12 hours" }]) {
    assert.equal((await request(query)).status, 400);
  }
  assert.equal(calls.length, 0);
  const result = await request({ username: "Feinberg" });
  assert.equal(result.status, 200);
  assert.equal(result.body.uuid, uuid);
  assert.equal(result.body.timeframe, "lifetime");
  assert.equal(result.body.fastestElytraTimeFormatted, "12:16");
  assert.equal(result.body.fastestCompletionTimeFormatted, "2:05:48");
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.get("uuid"), uuid);
  const cached = await request({ uuid: uuid.replaceAll("-", "").toUpperCase() });
  assert.equal(cached.body.fastestElytraTime, 736000);
  assert.equal(calls.length, 2);
  assert.equal((await request({ username: "Missing" })).status, 404);
  assert.equal((await request({ username: "Broken" })).status, 502);
  status = 500;
  const otherUuid = "00000000-0000-0000-0000-000000000001";
  assert.equal((await request({ uuid: otherUuid })).status, 502);
  status = 200;
  assert.equal((await request({ uuid: otherUuid })).status, 200);
});
