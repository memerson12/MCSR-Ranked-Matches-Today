import express from "express";
import { parseUptime } from "../utils/uptime.js";
import fetch from "node-fetch";
import { getRequestContext } from "../utils/metrics.js";
import { fetchAARuns, formatAATime, getAAPlayerInput, resolveAAPlayerUuid } from "../utils/paceman_aa.js";

export async function fetchAAStats(uuid, startDate, options = {}) {
  let latestElytraRunId = null;
  const stats = {
    nethers: 0,
    elytras: 0,
    finished: 0,
    fastestElytraTime: null,
    latestElytraTime: null,
  };

  for await (const run of fetchAARuns(uuid, { ...options, startDate })) {
    if (Number.isFinite(run.nether) && run.nether > 0) stats.nethers++;
    if (Number.isFinite(run.elytra) && run.elytra > 0) {
      stats.elytras++;
      stats.fastestElytraTime = stats.fastestElytraTime === null
        ? run.elytra
        : Math.min(stats.fastestElytraTime, run.elytra);
      // Paceman orders run history by descending run ID, not update time.
      if (latestElytraRunId === null || run.id > latestElytraRunId) {
        latestElytraRunId = run.id;
        stats.latestElytraTime = run.elytra;
      }
    }
    if (Number.isFinite(run.finish) && run.finish > 0) stats.finished++;
  }
  return {
    ...stats,
    fastestElytraTimeFormatted: formatAATime(stats.fastestElytraTime),
    latestElytraTimeFormatted: formatAATime(stats.latestElytraTime),
  };
}

export function createAAStatsRouter({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const player = getAAPlayerInput(req.query);
    if (player.error) return res.status(400).json({ error: player.error });
    const { username } = player;
    const { timeframe } = req.query;
    const context = getRequestContext(res);
    if (timeframe === "[Error: Stream is offline.]") {
      return res.status(400).json({ error: "Stream is offline." });
    }
    const currentTime = now();
    const effectiveTimeframe = timeframe === undefined ? "24 hours" : timeframe;
    const startDate = parseUptime(effectiveTimeframe, currentTime);
    if (!startDate) {
      return res.status(400).json({ error: "Invalid timeframe. Use '1 hour and 5 minutes'." });
    }
    const timeout = AbortSignal.timeout(15000);
    const signal = context?.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
    try {
      context?.setStage("fetch_user");
      const playerUuid = await resolveAAPlayerUuid(player, { signal, fetchImpl });
      if (!playerUuid) {
        return res.status(404).json({ error: `Minecraft player ${username} was not found` });
      }
      context?.setStage("fetch_aa_runs");
      const stats = await fetchAAStats(playerUuid, startDate, { signal, fetchImpl, now: currentTime });
      context?.setStage("response_write");
      return res.json({
        username: username || null,
        uuid: playerUuid,
        timeframe: effectiveTimeframe,
        startTime: startDate.toISOString(),
        ...stats,
      });
    } catch (error) {
      if (context?.signal.aborted) return;
      context?.log("error", "aa_stats_request_failed", { error: error.message });
      return res.status(502).json({ error: "Failed to fetch AA run data" });
    }
  });
  return router;
}

export default createAAStatsRouter();
