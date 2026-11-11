import express from "express";
import { parseUptime } from "../utils/uptime.js";
import fetch from "node-fetch";
import { getRequestContext, recordUpstreamRequest } from "../utils/metrics.js";

const PACEMAN_API = "https://paceman.gg/stats/api";
const MAX_PAGES = 20;

export async function fetchAAStats(uuid, startDate, options = {}) {
  const { signal, fetchImpl = fetch, now = new Date() } = options;
  const seenRuns = new Set();
  const seenCursors = new Set();
  let beforeId;
  const stats = { nethers: 0, elytras: 0, finished: 0 };

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ uuid, limit: "100" });
    if (beforeId !== undefined) query.set("beforeId", String(beforeId));
    const response = await recordUpstreamRequest(
      { upstream: "paceman", operation: "fetch_aa_runs" },
      () => fetchImpl(`${PACEMAN_API}/getAAPlayerRuns/?${query}`, { signal }),
    );
    if (!response.ok) throw new Error(`Paceman returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.rows) || typeof data.hasMore !== "boolean") {
      throw new Error("Invalid Paceman AA response");
    }
    let reachedStart = false;
    for (const run of data.rows) {
      if (!run || run.id == null || !Number.isFinite(run.lastUpdated)) {
        throw new Error("Invalid Paceman AA run");
      }
      if (run.lastUpdated < startDate.getTime()) {
        reachedStart = true;
        continue;
      }
      if (run.lastUpdated > now.getTime() || seenRuns.has(run.id)) continue;
      seenRuns.add(run.id);
      if (Number.isFinite(run.nether) && run.nether > 0) stats.nethers++;
      if (Number.isFinite(run.elytra) && run.elytra > 0) stats.elytras++;
      if (Number.isFinite(run.finish) && run.finish > 0) stats.finished++;
    }
    if (reachedStart || !data.hasMore) return stats;
    if (!data.rows.length || !Number.isSafeInteger(data.nextCursor) ||
        seenCursors.has(data.nextCursor) ||
        (beforeId !== undefined && data.nextCursor >= beforeId)) {
      throw new Error("Paceman AA pagination did not advance");
    }
    seenCursors.add(data.nextCursor);
    beforeId = data.nextCursor;
  }
  throw new Error("Paceman AA history exceeded page limit");
}

export function createAAStatsRouter({ fetchImpl = fetch, now = () => new Date() } = {}) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    const { username, uuid, timeframe } = req.query;
    const context = getRequestContext(res);
    if (uuid !== undefined && (typeof uuid !== "string" ||
        !/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(uuid))) {
      return res.status(400).json({ error: "Invalid Minecraft UUID" });
    }
    if (!uuid && (typeof username !== "string" || !/^[a-zA-Z0-9_]{1,16}$/.test(username))) {
      return res.status(400).json({ error: "A valid Minecraft username or UUID is required" });
    }
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
      let playerUuid = uuid;
      if (!playerUuid) {
        context?.setStage("fetch_user");
        const response = await recordUpstreamRequest(
          { upstream: "mojang", operation: "fetch_user" },
          () => fetchImpl(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`, { signal }),
        );
        if (response.status === 204 || response.status === 404) {
          return res.status(404).json({ error: `Minecraft player ${username} was not found` });
        }
        if (!response.ok) throw new Error(`Mojang returned ${response.status}`);
        const player = await response.json();
        if (!/^[0-9a-f]{32}$/i.test(player?.id)) throw new Error("Invalid Mojang profile");
        playerUuid = player.id;
      }
      // Mojang returns compact UUIDs; Paceman stores them with hyphens.
      playerUuid = playerUuid.replaceAll("-", "").toLowerCase()
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
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
