import express from "express";
import fetch from "node-fetch";
import {
  getRequestContext,
  recordDraftoutRequest,
  recordUpstreamRequest,
} from "../utils/metrics.js";
import { getChannelFromHeaders } from "../utils/headers_parser.js";

const router = express.Router();
const DRAFTOUT_API_BASE_URL = "https://draftoutmc.com/api/stats";
const DRAFTOUT_FILTER = "competitive";
const DRAFTOUT_LEADERBOARD_METRIC = "elo";
const MAX_DRAFTOUT_PAGES = 50;

router.get("/leaderboard", async (req, res) => {
  recordDraftoutRequestOnFinish(req, res, "leaderboard");

  const top = getSingleQueryValue(req.query.top);

  if (req.query.top !== undefined && !isPositiveInteger(top)) {
    return res.status(400).json({ error: "top must be a positive integer" });
  }

  try {
    const leaderboard = await fetchDraftoutLeaderboard(top);

    res.status(200).json(summarizeDraftoutLeaderboard(leaderboard));
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

router.get("/", async (req, res) => {
  recordDraftoutRequestOnFinish(req, res, "stats");

  const username = getSingleQueryValue(req.query.username);
  const timeframe = getSingleQueryValue(req.query.timeframe);
  const channel = getChannelFromHeaders(req.headers) || "anonymous";
  const requestContext = getRequestContext(res);
  const signal = requestContext?.signal;

  requestContext?.setStage("before_upstream");
  requestContext?.setLogContext({
    channel,
    username: username || null,
    timeframe: timeframe || null,
  });

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    let startDate = null;

    if (timeframe) {
      if (timeframe === "[Error: Stream is offline.]") {
        return res.status(400).json({
          error: "Stream is offline.",
        });
      }

      startDate = parseUptime(timeframe);
    }

    if (timeframe && !startDate) {
      return res.status(400).json({
        error: `Invalid timeframe format. Use '1 hour and 5 minutes' or '1 minute and 23 seconds' (received: ${timeframe})`,
      });
    }

    requestContext?.setStage("fetch_draftout_stats");
    const pages = await fetchDraftoutStatPages(username, startDate, {
      signal,
      setAbortStage: requestContext?.setStage,
    });
    const firstPage = pages[0];

    if (!firstPage?.player) {
      return res
        .status(404)
        .json({ error: `No Draftout stats for ${username} were found` });
    }

    requestContext?.setStage("response_write");
    res
      .status(200)
      .json(summarizeDraftoutStats(username, timeframe, startDate, pages));
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) {
      return;
    }

    requestContext?.log("error", "draftout_request_failed", {
      error: error?.message || String(error),
    });

    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to fetch Draftout match data" });
    }
  }
});

async function fetchDraftoutLeaderboard(top) {
  const searchParams = new URLSearchParams({
    metric: DRAFTOUT_LEADERBOARD_METRIC,
  });

  if (top !== null) {
    searchParams.set("limit", top);
  }

  const response = await recordUpstreamRequest(
    { upstream: "draftout", operation: "fetch_leaderboard" },
    () => fetch(`${DRAFTOUT_API_BASE_URL}?${searchParams.toString()}`)
  );

  if (!response.ok) {
    throw new Error(`Draftout leaderboard returned ${response.status}`);
  }

  return response.json();
}

async function fetchDraftoutStatPages(username, startDate, options = {}) {
  const { signal, setAbortStage } = options;
  const pages = [];
  let pageNumber = 1;
  let totalPages = 1;
  let shouldContinue = true;

  while (shouldContinue) {
    if (signal?.aborted) {
      throw createAbortError(signal.reason);
    }

    if (pageNumber > MAX_DRAFTOUT_PAGES) {
      throw new Error("Draftout pagination exceeded safe page limit");
    }

    setAbortStage?.("fetch_draftout_stats");
    const page = await fetchDraftoutStatPage(username, pageNumber, { signal });
    pages.push(page);

    if (!page.player) {
      break;
    }

    totalPages = getSafeTotalPages(page.totalPages);

    if (!startDate || pageContainsMatchBefore(page, startDate)) {
      break;
    }

    pageNumber++;
    shouldContinue = pageNumber <= totalPages;
  }

  return pages;
}

export function summarizeDraftoutLeaderboard(data) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  return rows
    .map((row) => ({
      username: row.username,
      rank: row.rank,
      elo: row.elo,
    }))
    .filter(
      (entry) =>
        entry.username &&
        Number.isFinite(entry.rank) &&
        Number.isFinite(entry.elo)
    );
}

async function fetchDraftoutStatPage(username, page, options = {}) {
  const { signal } = options;
  const searchParams = new URLSearchParams({
    page: String(page),
    filter: DRAFTOUT_FILTER,
  });
  const url = `${DRAFTOUT_API_BASE_URL}/${encodeURIComponent(
    username
  )}?${searchParams.toString()}`;
  const response = await recordUpstreamRequest(
    { upstream: "draftout", operation: "fetch_stats" },
    () => fetch(url, { signal })
  );

  if (!response.ok) {
    throw new Error(`Draftout stats returned ${response.status}`);
  }

  return response.json();
}

export function summarizeDraftoutStats(
  requestedUsername,
  timeframe,
  startDate,
  pages
) {
  const firstPage = pages[0] ?? {};
  const player = firstPage.player ?? {};
  const record = firstPage.record ?? {};
  let totalMatchesCount = 0;
  let wonMatchesCount = 0;
  let drawCount = 0;
  let totalEloChange = 0;

  for (const page of pages) {
    const matches = Array.isArray(page.matches) ? page.matches : [];

    for (const match of matches) {
      if (!isMatchInsideWindow(match, startDate)) {
        continue;
      }

      const participant = findPlayerParticipant(match, player, requestedUsername);
      if (!participant) {
        continue;
      }

      totalMatchesCount++;

      if (isDraw(match)) {
        drawCount++;
      } else if (participant.won === true) {
        wonMatchesCount++;
      }

      if (Number.isFinite(participant.eloChange)) {
        totalEloChange += participant.eloChange;
      }
    }
  }

  return {
    username: player.username || requestedUsername,
    timeframe: timeframe || "N/A",
    startTime: startDate ? startDate.toISOString() : "N/A",
    totalMatchesCount,
    wonMatchesCount,
    lossMatchesCount: totalMatchesCount - wonMatchesCount - drawCount,
    drawCount,
    totalEloChange,
    currentElo: player.elo ?? null,
    currentRank: player.rank ?? null,
    overallMatches: record.matches ?? 0,
    overallWins: record.wins ?? 0,
    overallLosses: record.losses ?? 0,
    overallDraws: record.draws ?? 0,
  };
}

function findPlayerParticipant(match, player, requestedUsername) {
  const participants = Array.isArray(match.participants)
    ? match.participants
    : [];

  return participants.find((participant) => {
    if (player.uuid && participant.uuid === player.uuid) {
      return true;
    }

    return (
      participant.username?.toLowerCase() === requestedUsername.toLowerCase()
    );
  });
}

function isDraw(match) {
  if (typeof match.outcome === "string" && match.outcome.startsWith("draw")) {
    return true;
  }

  const participants = Array.isArray(match.participants)
    ? match.participants
    : [];
  return !participants.some((participant) => participant.won === true);
}

function isMatchInsideWindow(match, startDate) {
  if (!startDate) {
    return false;
  }

  const completedAt = Number(match.completedAt);
  if (!Number.isFinite(completedAt)) {
    return false;
  }

  return new Date(completedAt) >= startDate;
}

function pageContainsMatchBefore(page, startDate) {
  const matches = Array.isArray(page.matches) ? page.matches : [];

  return matches.some((match) => {
    const completedAt = Number(match.completedAt);
    return Number.isFinite(completedAt) && new Date(completedAt) < startDate;
  });
}

function getSafeTotalPages(totalPages) {
  const numericTotalPages = Number(totalPages);

  if (!Number.isInteger(numericTotalPages) || numericTotalPages < 1) {
    return 1;
  }

  return Math.min(numericTotalPages, MAX_DRAFTOUT_PAGES);
}

export function parseUptime(timeframe, now = new Date()) {
  const timeComponents = timeframe.match(/(\d+)\s*(hour|minute|second)s?/g);
  if (!timeComponents) return null;

  let totalMinutes = 0;
  let totalSeconds = 0;

  timeComponents.forEach((component) => {
    const [value, unit] = component.split(/\s+/);
    const intValue = parseInt(value);

    if (unit.startsWith("hour")) {
      totalMinutes += intValue * 60;
    } else if (unit.startsWith("minute")) {
      totalMinutes += intValue;
    } else if (unit.startsWith("second")) {
      totalSeconds += intValue;
    }
  });

  totalMinutes += Math.floor(totalSeconds / 60);
  totalSeconds = totalSeconds % 60;

  return new Date(now.getTime() - (totalMinutes * 60 + totalSeconds) * 1000);
}

export function isPositiveInteger(value) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function getSingleQueryValue(value) {
  if (Array.isArray(value)) {
    return getSingleQueryValue(value[0]);
  }

  return typeof value === "string" ? value.trim() : null;
}

function recordDraftoutRequestOnFinish(req, res, endpoint) {
  const channel = getChannelFromHeaders(req.headers) || "anonymous";

  res.on("finish", () => {
    recordDraftoutRequest(channel, endpoint, res.statusCode);
  });
}

function createAbortError(reason) {
  const error = new Error(reason || "aborted");
  error.name = "AbortError";
  return error;
}

export default router;
