import fetch from "node-fetch";
import { recordUpstreamRequest } from "./metrics.js";

const PACEMAN_API = "https://paceman.gg/stats/api";

export async function* fetchAARuns(uuid, options = {}) {
  const { signal, fetchImpl = fetch, now = new Date(), startDate = null, maxPages = 20 } = options;
  const seenRuns = new Set();
  const seenCursors = new Set();
  let beforeId;
  for (let page = 0; page < maxPages; page++) {
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
      if (!run || !Number.isSafeInteger(run.id) || !Number.isFinite(run.lastUpdated)) {
        throw new Error("Invalid Paceman AA run");
      }
      if (startDate && run.lastUpdated < startDate.getTime()) {
        reachedStart = true;
        continue;
      }
      if (run.lastUpdated > now.getTime() || seenRuns.has(run.id)) continue;
      seenRuns.add(run.id);
      yield run;
    }
    if (reachedStart || !data.hasMore) return;
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

export function getAAPlayerInput(query) {
  const { username, uuid } = query;
  if (uuid !== undefined && (typeof uuid !== "string" ||
      !/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(uuid))) {
    return { error: "Invalid Minecraft UUID" };
  }
  if ((!uuid || username !== undefined) &&
      (typeof username !== "string" || !/^[a-zA-Z0-9_]{1,16}$/.test(username))) {
    return { error: "A valid Minecraft username or UUID is required" };
  }
  return { username, uuid };
}

export async function resolveAAPlayerUuid({ username, uuid }, options = {}) {
  const { signal, fetchImpl = fetch } = options;
  let playerUuid = uuid;
  if (!playerUuid) {
    const response = await recordUpstreamRequest(
      { upstream: "mojang", operation: "fetch_user" },
      () => fetchImpl(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`, { signal }),
    );
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw new Error(`Mojang returned ${response.status}`);
    const player = await response.json();
    if (!/^[0-9a-f]{32}$/i.test(player?.id)) throw new Error("Invalid Mojang profile");
    playerUuid = player.id;
  }
  // Mojang returns compact UUIDs; Paceman stores them with hyphens.
  return playerUuid.replaceAll("-", "").toLowerCase()
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

export function formatAATime(milliseconds, { includeHours = false } = {}) {
  if (milliseconds === null) return "None";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  if (includeHours && minutes >= 60) {
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}
