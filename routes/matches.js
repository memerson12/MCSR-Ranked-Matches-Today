import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/", async (req, res) => {
  const { username, timeframe } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const userData = await fetchUserData(username);
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
    } else {
      startDate = parseUptime(timeframe);
    }
  }

  if (timeframe && !startDate) {
    return res.status(400).json({
      error: `Invalid timeframe format. Use '1 hour and 5 minutes' or '1 minute and 23 seconds' (received: ${timeframe})`,
    });
  }

  const matchStats = await fetchMatchStats(username, userUUID, startDate);

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
});

async function fetchMatchStats(username, userUUID, startDate) {
  let wonMatchesCount = 0;
  let totalMatchesCount = 0;
  let totalEloChange = 0;
  let drawCount = 0;
  let page = 0;
  let continueChecking = true;
  const baseUrl = `https://mcsrranked.com/api/users/${username}/matches`;

  if (startDate) {
    while (continueChecking) {
      const url = `${baseUrl}?count=25&page=${page}&type=2`;
      const response = await fetch(url);
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

async function fetchUserData(username) {
  const response = await fetch(`https://mcsrranked.com/api/users/${username}`);
  const data = await response.json();
  return data.status === "success" ? data.data : null;
}

export default router;

// r=$(urlfetch $(urlencode $(twitch $(user) '{{uptimeLength}}')))&username=MC_USERNAME); r['error'] ? `${r['error']}` : `$(channel.display_name)'s stats since stream start - Elo: ${r['totalEloChange']} | Record: ${r['wonMatchesCount']} W - ${r['lossMatchesCount']} L - ${r['drawCount']} D`)
