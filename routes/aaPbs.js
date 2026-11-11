import express from "express";
import fetch from "node-fetch";
import { getRequestContext } from "../utils/metrics.js";
import { createAsyncLruCache } from "../utils/async_lru_cache.js";
import { fetchAARuns, formatAATime, getAAPlayerInput, resolveAAPlayerUuid } from "../utils/paceman_aa.js";

const PB_SPLITS = {
  nether: "fastestNetherTime",
  bastion: "fastestBastionTime",
  fortress: "fastestFortressTime",
  stronghold: "fastestStrongholdTime",
  end: "fastestEndTime",
  elytra: "fastestElytraTime",
  credits: "fastestEndExitTime",
  finish: "fastestCompletionTime",
};

export async function fetchAAPbs(uuid, options = {}) {
  const pbs = Object.fromEntries(Object.values(PB_SPLITS).map((field) => [field, null]));
  for await (const run of fetchAARuns(uuid, { maxPages: 100, ...options, startDate: null })) {
    // Match Paceman's AA leaderboard eligibility rules.
    if (run.nether < 120000 && run.end == null) continue;
    if (run.credits != null && run.elytra == null) continue;
    for (const [split, field] of Object.entries(PB_SPLITS)) {
      const time = run[split];
      if (Number.isFinite(time) && time > 0 && (pbs[field] === null || time < pbs[field])) {
        pbs[field] = time;
      }
    }
  }
  return Object.fromEntries(Object.entries(pbs).flatMap(([field, time]) => [
    [field, time],
    [`${field}Formatted`, formatAATime(time, { includeHours: true })],
  ]));
}

export function createAAPbsRouter({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const router = express.Router();
  const cache = createAsyncLruCache({ max: 500, ttlMs: 300000, maxStaleMs: 300000, loadTimeoutMs: 15000 });
  router.get("/", async (req, res) => {
    const player = getAAPlayerInput(req.query);
    if (player.error) return res.status(400).json({ error: player.error });
    if (req.query.timeframe !== undefined) {
      return res.status(400).json({ error: "AA PBs cover lifetime history; timeframe is not supported" });
    }
    const context = getRequestContext(res);
    const timeout = AbortSignal.timeout(15000);
    const signal = context?.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
    try {
      context?.setStage("fetch_user");
      const uuid = await resolveAAPlayerUuid(player, { fetchImpl, signal });
      if (!uuid) {
        return res.status(404).json({ error: `Minecraft player ${player.username} was not found` });
      }
      context?.setStage("fetch_aa_pbs");
      const { value: pbs } = await cache.get(uuid, {
        signal,
        load: ({ signal: loadSignal }) => fetchAAPbs(uuid, { fetchImpl, signal: loadSignal, now: now() }),
      });
      context?.setStage("response_write");
      return res.json({ username: player.username || null, uuid, timeframe: "lifetime", ...pbs });
    } catch (error) {
      if (context?.signal.aborted) return;
      context?.log("error", "aa_pbs_request_failed", { error: error.message });
      return res.status(502).json({ error: "Failed to fetch complete AA PB history" });
    }
  });
  return router;
}

export default createAAPbsRouter();
