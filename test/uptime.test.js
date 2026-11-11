import assert from "node:assert/strict";
import test from "node:test";
import { parseUptime } from "../utils/uptime.js";

const now = new Date("2026-11-09T20:00:00Z");

test("shared uptime parser handles bot durations and rejects malformed inputs", () => {
  assert.equal(parseUptime("1 hour and 5 minutes", now).toISOString(), "2026-11-09T18:55:00.000Z");
  assert.equal(parseUptime("23seconds", now).getTime(), now.getTime() - 23000);
  assert.equal(parseUptime("0 seconds", now).getTime(), now.getTime());
  for (const value of [null, [], "", "-1 hour", "1 hour junk", "offline"]) {
    assert.equal(parseUptime(value, now), null);
  }
});

