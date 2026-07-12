import express from "express";
import fetch from "node-fetch";
import {
  getRequestContext,
  instrumentDraftoutRequest,
  instrumentDraftoutWidgetUserRequest,
  recordUpstreamRequest,
} from "../utils/metrics.js";
import { getChannelFromHeaders } from "../utils/headers_parser.js";

const router = express.Router();
const DRAFTOUT_API_BASE_URL = "https://draftoutmc.com/api/stats";
const DRAFTOUT_FILTER = "competitive";
const DRAFTOUT_LEADERBOARD_METRIC = "elo";
const MAX_DRAFTOUT_PAGES = 50;
const DEFAULT_WIDGET_GAP_HOURS = 6;
const DEFAULT_WIDGET_REFRESH_SECONDS = 30;
const DEFAULT_WIDGET_ACCENT = "#58d5e8";

router.get("/leaderboard", async (req, res) => {
  prepareDraftoutRouteContext(req, res, "leaderboard");

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

router.get("/widget", async (req, res) => {
  const username = getSingleQueryValue(req.query.username);
  const options = getDraftoutWidgetOptions(req.query);
  const { channel, requestContext, signal } = prepareDraftoutRouteContext(
    req,
    res,
    "widget",
    {
      username: username || null,
      gapHours: options.gapHours,
    },
  );

  instrumentDraftoutWidgetUserRequestIfPresent(requestContext, {
    username,
    channel,
  });

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    requestContext?.setStage("fetch_draftout_widget_stats");
    const pages = await fetchDraftoutWidgetPages(username, options.gapHours, {
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
    res.status(200).json({
      ...summarizeDraftoutWidgetStats(username, pages, {
        gapHours: options.gapHours,
      }),
      options,
    });
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) {
      return;
    }

    requestContext?.log("error", "draftout_widget_request_failed", {
      error: error?.message || String(error),
    });

    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to fetch Draftout widget data" });
    }
  }
});

router.get("/", async (req, res) => {
  const username = getSingleQueryValue(req.query.username);
  const timeframe = getSingleQueryValue(req.query.timeframe);
  const { requestContext, signal } = prepareDraftoutRouteContext(
    req,
    res,
    "stats",
    {
      username: username || null,
      timeframe: timeframe || null,
    },
  );

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

router.get("/winstreak", async (req, res) => {
  const username = getSingleQueryValue(req.query.username);
  const { requestContext, signal } = prepareDraftoutRouteContext(
    req,
    res,
    "winstreak",
    { username: username || null },
  );

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    requestContext?.setStage("fetch_draftout_stats");
    const pages = await fetchDraftoutPagesUntilLastLoss(username, {
      signal,
      setAbortStage: requestContext?.setStage,
    });

    const firstPage = pages[0];

    if (!firstPage?.player) {
      return res
        .status(404)
        .json({ error: `No Draftout stats for ${username} were found` });
    }

    const peakWinstreak = firstPage.aggregate?.bestStreak ?? null;
    const currentWinstreak = computeCurrentWinstreakFromPages(
      pages,
      firstPage.player,
      username,
    );

    requestContext?.setStage("response_write");
    res.status(200).json({
      username: firstPage.player.username || username,
      peakWinstreak,
      currentWinstreak,
    });
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) {
      return;
    }

    requestContext?.log("error", "draftout_winstreak_failed", {
      error: error?.message || String(error),
    });

    if (!res.headersSent) {
      res
        .status(502)
        .json({ error: "Failed to fetch Draftout winstreak data" });
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
    () => fetch(`${DRAFTOUT_API_BASE_URL}?${searchParams.toString()}`),
  );

  if (!response.ok) {
    throw new Error(`Draftout leaderboard returned ${response.status}`);
  }

  return response.json();
}

async function fetchDraftoutStatPages(username, startDate, options = {}) {
  return fetchDraftoutPages(username, {
    ...options,
    stage: "fetch_draftout_stats",
    shouldStop: ({ page }) =>
      !page.player || !startDate || pageContainsMatchBefore(page, startDate),
  });
}

async function fetchDraftoutWidgetPages(username, gapHours, options = {}) {
  let player = null;

  return fetchDraftoutPages(username, {
    ...options,
    stage: "fetch_draftout_widget_stats",
    shouldStop: ({ page, pages }) => {
      player ??= page.player ?? null;

      return (
        !page.player ||
        (widgetPagesContainSessionBoundary(pages, gapHours, new Date()) &&
          pagesContainLossForPlayer(pages, player, username))
      );
    },
  });
}

async function fetchDraftoutPagesUntilLastLoss(username, options = {}) {
  let player = null;

  return fetchDraftoutPages(username, {
    ...options,
    stage: "fetch_draftout_stats",
    shouldStop: ({ page }) => {
      player ??= page.player ?? null;
      return pageContainsLossForPlayer(page, player, username);
    },
  });
}

async function fetchDraftoutPages(username, options = {}) {
  const { signal, setAbortStage, stage, shouldStop } = options;
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

    setAbortStage?.(stage);
    const page = await fetchDraftoutStatPage(username, pageNumber, { signal });
    pages.push(page);

    if (shouldStop?.({ page, pages, pageNumber }) === true) {
      break;
    }

    totalPages = getSafeTotalPages(page.totalPages);
    pageNumber++;
    shouldContinue = pageNumber <= totalPages;
  }

  return pages;
}

function pageContainsLossForPlayer(page, player, requestedUsername) {
  const matches = Array.isArray(page.matches) ? page.matches : [];

  return matches.some((match) => {
    const participant = findPlayerParticipant(match, player, requestedUsername);
    return isLossForPlayer(match, participant);
  });
}

function pagesContainLossForPlayer(pages, player, requestedUsername) {
  return pages.some((page) =>
    pageContainsLossForPlayer(page, player, requestedUsername),
  );
}

function computeCurrentWinstreakFromPages(pages, player, requestedUsername) {
  const matches = getSortedDraftoutMatches(pages);
  let streak = 0;

  for (const match of matches) {
    const participant = findPlayerParticipant(match, player, requestedUsername);

    if (!participant) {
      continue;
    }

    if (isLossForPlayer(match, participant)) {
      break; // reached last loss
    }

    if (participant.won === true) {
      streak++;
    }
    // draws do not break the streak but do not increment it
  }

  return streak;
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
        Number.isFinite(entry.elo),
    );
}

export function summarizeDraftoutWidgetStats(
  requestedUsername,
  pages,
  options = {},
) {
  const gapHours = normalizePositiveNumber(
    options.gapHours,
    DEFAULT_WIDGET_GAP_HOURS,
  );
  const now = options.now instanceof Date ? options.now : new Date();
  const firstPage = pages[0] ?? {};
  const player = firstPage.player ?? {};
  const record = firstPage.record ?? {};
  const aggregate = firstPage.aggregate ?? {};
  const allMatches = getSortedDraftoutMatches(pages);
  const activeSessionMatches = getActiveSessionMatches(
    allMatches,
    gapHours,
    now,
  );
  const hasActiveSession = activeSessionMatches.length > 0;
  const session = summarizeDraftoutSessionMatches(
    activeSessionMatches,
    player,
    requestedUsername,
  );
  session.currentWinStreak = computeCurrentWinstreakFromPages(
    pages,
    player,
    requestedUsername,
  );
  const latestMatch = hasActiveSession
    ? summarizeLatestDraftoutMatch(
        activeSessionMatches[0],
        player,
        requestedUsername,
      )
    : null;

  return {
    username: player.username || requestedUsername,
    currentElo: player.elo ?? null,
    currentRank: player.rank ?? null,
    rankName: player.rankName ?? null,
    rankColor: player.rankColor ?? null,
    hasActiveSession,
    session,
    latestMatch,
    overall: {
      matches: record.matches ?? 0,
      completedMatches: record.completedMatches ?? record.matches ?? 0,
      wins: record.wins ?? 0,
      losses: record.losses ?? 0,
      draws: record.draws ?? 0,
      winRate: Number.isFinite(record.winRate)
        ? Math.round(record.winRate * 100)
        : 0,
    },
    aggregate: {
      peakElo: aggregate.peakElo ?? null,
      bestStreak: aggregate.bestStreak ?? null,
    },
    generatedAt: now.toISOString(),
  };
}

export function getDraftoutWidgetOptions(query) {
  const requestedMode = getSingleQueryValue(query.mode);
  const mode = ["ultra_compact", "compact", "expanded"].includes(requestedMode)
    ? requestedMode
    : "compact";

  return {
    mode,
    gapHours: normalizePositiveNumber(
      getSingleQueryValue(query.gapHours),
      DEFAULT_WIDGET_GAP_HOURS,
    ),
    refreshSeconds: normalizePositiveNumber(
      getSingleQueryValue(query.refreshSeconds),
      DEFAULT_WIDGET_REFRESH_SECONDS,
    ),
    accent: normalizeAccent(getSingleQueryValue(query.accent)),
  };
}

async function fetchDraftoutStatPage(username, page, options = {}) {
  const { signal } = options;
  const searchParams = new URLSearchParams({
    page: String(page),
    filter: DRAFTOUT_FILTER,
  });
  const url = `${DRAFTOUT_API_BASE_URL}/${encodeURIComponent(
    username,
  )}?${searchParams.toString()}`;
  const response = await recordUpstreamRequest(
    { upstream: "draftout", operation: "fetch_stats" },
    () => fetch(url, { signal }),
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
  pages,
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

      const participant = findPlayerParticipant(
        match,
        player,
        requestedUsername,
      );
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

function summarizeDraftoutSessionMatches(matches, player, requestedUsername) {
  let wonMatchesCount = 0;
  let drawCount = 0;
  let totalEloChange = 0;
  let currentWinStreak = 0;
  let streakOpen = true;

  for (const match of matches) {
    const participant = findPlayerParticipant(match, player, requestedUsername);
    if (!participant) {
      continue;
    }

    const draw = isDraw(match);
    const won = !draw && participant.won === true;

    if (draw) {
      drawCount++;
    } else if (won) {
      wonMatchesCount++;
    }

    if (streakOpen && won) {
      currentWinStreak++;
    } else {
      streakOpen = false;
    }

    if (Number.isFinite(participant.eloChange)) {
      totalEloChange += participant.eloChange;
    }
  }

  const totalMatchesCount = matches.length;
  const lossMatchesCount = totalMatchesCount - wonMatchesCount - drawCount;

  return {
    totalMatchesCount,
    wonMatchesCount,
    lossMatchesCount,
    drawCount,
    totalEloChange,
    winRate:
      totalMatchesCount > 0
        ? Math.round((wonMatchesCount / totalMatchesCount) * 100)
        : 0,
    currentWinStreak,
  };
}

function summarizeLatestDraftoutMatch(match, player, requestedUsername) {
  const participant = findPlayerParticipant(match, player, requestedUsername);
  const opponent = findOpponentParticipant(match, participant);
  const draw = isDraw(match);
  let result = "loss";

  if (draw) {
    result = "draw";
  } else if (participant?.won === true) {
    result = "win";
  }

  return {
    id: match.id ?? null,
    completedAt: Number.isFinite(Number(match.completedAt))
      ? new Date(Number(match.completedAt)).toISOString()
      : null,
    outcome: match.outcome ?? null,
    result,
    opponentUsername: opponent?.username ?? null,
    opponentElo: opponent?.eloBefore ?? null,
    playerScore: participant?.score ?? null,
    opponentScore: opponent?.score ?? null,
    eloChange: participant?.eloChange ?? null,
    durationMs: match.durationMs ?? null,
  };
}

function findOpponentParticipant(match, participant) {
  const participants = Array.isArray(match.participants)
    ? match.participants
    : [];

  if (!participant) {
    return participants[0] ?? null;
  }

  return (
    participants.find((candidate) => candidate.uuid !== participant.uuid) ??
    null
  );
}

function getActiveSessionMatches(matches, gapHours, now) {
  if (matches.length === 0) {
    return [];
  }

  const newestCompletedAt = getCompletedAtDate(matches[0]);
  if (!newestCompletedAt || hoursBetween(now, newestCompletedAt) > gapHours) {
    return [];
  }

  const activeMatches = [matches[0]];

  for (let index = 1; index < matches.length; index++) {
    const previousCompletedAt = getCompletedAtDate(matches[index - 1]);
    const currentCompletedAt = getCompletedAtDate(matches[index]);

    if (
      !previousCompletedAt ||
      !currentCompletedAt ||
      hoursBetween(previousCompletedAt, currentCompletedAt) > gapHours
    ) {
      break;
    }

    activeMatches.push(matches[index]);
  }

  return activeMatches;
}

function widgetPagesContainSessionBoundary(pages, gapHours, now) {
  const matches = getSortedDraftoutMatches(pages);

  if (matches.length === 0) {
    return true;
  }

  const newestCompletedAt = getCompletedAtDate(matches[0]);
  if (!newestCompletedAt || hoursBetween(now, newestCompletedAt) > gapHours) {
    return true;
  }

  return (
    getActiveSessionMatches(matches, gapHours, now).length < matches.length
  );
}

function getSortedDraftoutMatches(pages) {
  return pages
    .flatMap((page) => (Array.isArray(page.matches) ? page.matches : []))
    .filter((match) => Number.isFinite(Number(match.completedAt)))
    .sort(
      (left, right) => Number(right.completedAt) - Number(left.completedAt),
    );
}

function getCompletedAtDate(match) {
  const completedAt = Number(match?.completedAt);

  return Number.isFinite(completedAt) ? new Date(completedAt) : null;
}

function hoursBetween(later, earlier) {
  return Math.abs(later.getTime() - earlier.getTime()) / 3600000;
}

function normalizePositiveNumber(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAccent(value) {
  const accent = typeof value === "string" ? value.trim() : "";
  const hex = accent.startsWith("#") ? accent.slice(1) : accent;

  return /^[0-9a-fA-F]{6}$/.test(hex)
    ? `#${hex.toLowerCase()}`
    : DEFAULT_WIDGET_ACCENT;
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

function isLossForPlayer(match, participant) {
  return Boolean(participant) && !isDraw(match) && participant.won === false;
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

function createAbortError(reason) {
  const error = new Error(reason || "aborted");
  error.name = "AbortError";
  return error;
}

function prepareDraftoutRouteContext(req, res, endpoint, logContext = {}) {
  const channel = getChannelFromHeaders(req.headers) || "anonymous";
  const requestContext = getRequestContext(res);

  requestContext?.setStage("before_upstream");
  requestContext?.setLogContext({ channel, ...logContext });
  instrumentDraftoutRequestIfPresent(requestContext, { channel, endpoint });

  return {
    channel,
    requestContext,
    signal: requestContext?.signal,
  };
}

function instrumentDraftoutRequestIfPresent(requestContext, options) {
  if (!requestContext) {
    return;
  }

  instrumentDraftoutRequest(requestContext, options);
}

function instrumentDraftoutWidgetUserRequestIfPresent(requestContext, options) {
  if (!requestContext) {
    return;
  }

  instrumentDraftoutWidgetUserRequest(requestContext, options);
}

export default router;
