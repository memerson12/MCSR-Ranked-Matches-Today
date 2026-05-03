import express from "express";
import fetch from "node-fetch";
import {
  getRequestContext,
  instrumentMatchesRequest,
  recordUpstreamRequest,
} from "../utils/metrics.js";
import { getChannelFromHeaders } from "../utils/headers_parser.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { username, timeframe } = req.query;
  const channel = getChannelFromHeaders(req.headers) || "anonymous";
  const requestContext = getRequestContext(res);
  const signal = requestContext?.signal;

  requestContext.setStage("before_upstream");
  requestContext.setLogContext({
    channel,
    username: username || null,
    timeframe: timeframe || null,
  });
  instrumentMatchesRequest(requestContext, { channel });

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    requestContext.setStage("fetch_user");
    const userData = await fetchUserData(username, {
      signal,
    });
    const userUUID = userData?.uuid;

    if (!userUUID) {
      return res
        .status(404)
        .json({ error: `No matches for ${username} were found` });
    }

    let startDate = null;

    if (timeframe) {
      if (timeframe === "[Error: Stream is offline.]") {
        return res.status(400).json({
          error: `Stream is offline.`,
        });
      }

      startDate = parseUptime(timeframe);
    }

    if (timeframe && !startDate) {
      return res.status(400).json({
        error: `Invalid timeframe format. Use '1 hour and 5 minutes' or '1 minute and 23 seconds' (received: ${timeframe})`,
      });
    }

    requestContext.setStage("fetch_matches");
    const matchStats = await fetchMatchStats(username, userUUID, startDate, {
      signal,
      setAbortStage: requestContext.setStage,
    });

    requestContext.setStage("response_write");
    res.status(200).json({
      username,
      timeframe: timeframe || "N/A",
      startTime: startDate ? startDate.toISOString() : "N/A",
      ...matchStats,
      currentElo: userData.eloRate,
      currentRank: userData.eloRank,
      seasonWins: userData.statistics.season.wins.ranked,
      seasonLosses: userData.statistics.season.loses.ranked,
      seasonPlaytime: parsePlaytime(userData.statistics.season.playtime.ranked),
      seasonPlayedMatches: userData.statistics.season.playedMatches.ranked,
    });
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) {
      return;
    }

    requestContext.log("error", "matches_request_failed", {
      error: error?.message || String(error),
    });

    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to fetch match data" });
    }
  }
});

async function fetchMatchStats(username, userUUID, startDate, options = {}) {
  const { signal, setAbortStage } = options;
  let wonMatchesCount = 0;
  let totalMatchesCount = 0;
  let totalEloChange = 0;
  let drawCount = 0;
  let page = 0;
  let continueChecking = true;
  const baseUrl = `https://mcsrranked.com/api/users/${username}/matches`;

  if (startDate) {
    while (continueChecking) {
      if (signal?.aborted) {
        throw createAbortError(signal.reason);
      }

      const url = `${baseUrl}?count=25&page=${page}&type=2`;
      setAbortStage?.("fetch_matches");
      const response = await recordUpstreamRequest(
        { upstream: "mcsrranked", operation: "fetch_matches" },
        () => fetch(url, { signal })
      );
      const data = await response.json();
      const matches = data["data"];

      if (matches.length === 0) break; // No more matches to fetch

      for (const match of matches) {
        const matchDate = new Date(parseInt(match["date"]) * 1000);

        if (matchDate < startDate) {
          continueChecking = false;
          break; // Stop checking as we've reached matches outside our time range
        }

        totalMatchesCount++;
        const resultUUID = match.result?.uuid;

        if (resultUUID === userUUID) {
          wonMatchesCount++;
        } else if (resultUUID === null) {
          drawCount++;
        }

        const eloChange = match.changes.find(
          (change) => change.uuid === userUUID
        );
        if (eloChange) totalEloChange += eloChange.change;
      }

      page++;
    }
  }

  return {
    totalMatchesCount,
    wonMatchesCount,
    lossMatchesCount: totalMatchesCount - wonMatchesCount - drawCount,
    totalEloChange,
    drawCount,
  };
}

function parsePlaytime(playtime) {
  const seconds = playtime / 1000;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} hours and ${minutes} minutes`;
}

function parseUptime(timeframe) {
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

  const currentTime = new Date();
  return new Date(
    currentTime.getTime() - (totalMinutes * 60 + totalSeconds) * 1000
  );
}

async function fetchUserData(username, options = {}) {
  const { signal } = options;
  const response = await recordUpstreamRequest(
    { upstream: "mcsrranked", operation: "fetch_user" },
    () => fetch(`https://mcsrranked.com/api/users/${username}`, { signal })
  );
  const data = await response.json();
  return data.status === "success" ? data.data : null;
}

function createAbortError(reason) {
  const error = new Error(reason || "aborted");
  error.name = "AbortError";
  return error;
}

export default router;

// r=$(urlfetch $(urlencode $(twitch $(user) '{{uptimeLength}}')))&username=MC_USERNAME); r['error'] ? `${r['error']}` : `$(channel.display_name)'s stats since stream start - Elo: ${r['totalEloChange']} | Record: ${r['wonMatchesCount']} W - ${r['lossMatchesCount']} L - ${r['drawCount']} D`)
