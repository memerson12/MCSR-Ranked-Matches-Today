import fetch from "node-fetch";

export default async function handler(req, res) {
  const { username, timeframe } = req.query;

  if (!username || !timeframe) {
    return res
      .status(400)
      .json({ error: "Username and timeframe are required parameters" });
  }

  // Parse the timeframe
  const timeComponents = timeframe.match(/(\d+)\s*(hour|minute|second)s?/g);
  if (!timeComponents) {
    return res.status(400).json({
      error: `Invalid timeframe format. Use format like '1 hour and 5 minutes' or '1 minute and 23 seconds' (received: ${timeframe})`,
    });
  }

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

  // Convert total seconds to minutes and seconds
  totalMinutes += Math.floor(totalSeconds / 60);
  totalSeconds = totalSeconds % 60;

  const currentTime = new Date();
  const startDate = new Date(
    currentTime.getTime() - (totalMinutes * 60 + totalSeconds) * 1000
  );

  const baseUrl = `https://mcsrranked.com/api/users/${username}/matches`;

  let wonMatchesCount = 0;
  let totalMatchesCount = 0;
  let totalEloChange = 0;
  let page = 0;
  let continueChecking = true;
  let userUUID = null;

  while (continueChecking) {
    const url = `${baseUrl}?count=25&page=${page}`;
    const response = await fetch(url);
    const data = await response.json();
    const matches = data["data"];

    if (matches.length === 0) {
      break; // No more matches to fetch
    }

    for (const match of matches) {
      const matchDate = new Date(parseInt(match["date"]) * 1000);

      if (matchDate < startDate) {
        continueChecking = false;
        break; // Stop checking as we've reached matches outside our time range
      }

      totalMatchesCount++;

      // Find the player object for the given username and get their UUID
      if (!userUUID) {
        const player = match.players.find(
          (p) => p.nickname.toLowerCase() === username.toLowerCase()
        );
        if (player) {
          userUUID = player.uuid;
        }
      }

      if (match.result && match.result.uuid === userUUID) {
        wonMatchesCount++;
      }

      // Calculate ELO change
      const eloChange = match.changes.find(
        (change) => change.uuid === userUUID
      );
      if (eloChange) {
        totalEloChange += eloChange.change;
      }
    }

    page++;
  }

  if (!userUUID) {
    return res.status(404).json({
      error: `No matches for ${username} were found since the start of stream`,
    });
  }

  res.status(200).json({
    username,
    userUUID,
    timeframe,
    startTime: startDate.toISOString(),
    totalMatchesCount,
    wonMatchesCount,
    lossMatchesCount: totalMatchesCount - wonMatchesCount,
    totalEloChange,
  });
}
// $(eval r=$(customapi https://mcsr-ranked-matches-today.vercel.app/api/matches?timeframe=$(urlencode $(uptime))&username=doogile); r['error'] ? `${JSON.stringify(r)}` : `$(channel.display_name)'s stats since stream start - elo: ${r['totalEloChange']} | Record: ${r['wonMatchesCount']} W - ${r['lossMatchesCount']} L`)
