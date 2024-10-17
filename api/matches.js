import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { username, startTime } = req.query;

  if (!username || !startTime) {
    return res.status(400).json({ error: 'Username and startTime are required parameters' });
  }

  const baseUrl = `https://mcsrranked.com/api/users/${username}/matches`;
  const startDate = new Date(parseInt(startTime));

  let wonMatchesCount = 0;
  let page = 0;
  let continueChecking = true;
  let userUUID = null;

  while (continueChecking) {
    const url = `${baseUrl}?count=25&page=${page}`;
    const response = await fetch(url);
    const data = await response.json();
    const matches = data['data'];

    if (matches.length === 0) {
      break; // No more matches to fetch
    }

    for (const match of matches) {
      const matchDate = new Date(parseInt(match['date']) * 1000);
      
      if (matchDate < startDate) {
        continueChecking = false;
        break; // Stop checking as we've reached matches outside our time range
      }

      // Find the player object for the given username and get their UUID
      if (!userUUID) {
        const player = match.players.find(p => p.nickname.toLowerCase() === username.toLowerCase());
        if (player) {
          userUUID = player.uuid;
        }
      }

      if (match.result && match.result.uuid === userUUID) {
        wonMatchesCount++;
      }
    }

    page++;
  }

  if (!userUUID) {
    return res.status(404).json({ error: 'User not found in any matches' });
  }

  res.status(200).json({
    username,
    userUUID,
    startTime: startDate.toISOString(),
    wonMatchesCount
  });
}