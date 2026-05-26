# MCSR Ranked Matches Today

This project provides APIs to fetch Minecraft Speedrun (MCSR) ranked match statistics, world records, and Draftout match statistics. It also includes a Draftout OBS browser-source widget and widget configuration page.

It includes four main functionalities:

1. **World Records Fetching** (`world_records.js`)
2. **Match Statistics Fetching** (`matches.js`)
3. **Draftout Match Statistics Fetching** (`draftout.js`)
4. **Draftout OBS Widget** (`public/draftout-widget.html`)

## World Records Fetching

The `world_records.js` script fetches world records from specified Google Sheets. It retrieves data such as the runner's name, in-game time (IGT), date, and status of the record.

### Key Functions

- **convertSerialDate(serialDate)**: Converts a serial date from Google Sheets to a human-readable date.
- **convertSerialTime(serialTime)**: Converts a serial time from Google Sheets to a human-readable time format.
- **batchGet(spreadsheetId, ranges)**: Fetches data from Google Sheets using the provided spreadsheet ID and ranges.
- **handler(req, res)**: Main handler function that processes the request and returns the world records in JSON format.

### Example Usage

To fetch world records, send a GET request to the endpoint where `world_records.js` is deployed. The response will be a JSON object containing the world records.

### Example Response

```json
{
  "any%_1.16+_rsg": {
    "runner": "drip120",
    "igt": "7:01.494",
    "date": "1/3/2024",
    "status": "accepted"
  },
  "any%_1.8_rsg": {
    "runner": "nieuh",
    "igt": "15:54",
    "date": "Unknown",
    "status": "accepted"
  },
  "any%_1.13-1.15_rsg": {
    "runner": "Ontricus",
    "igt": "13:12.438",
    "date": "Unknown",
    "status": "unverified"
  },
  "aa_1.16_rsg": {
    "runner": "Feinberg",
    "igt": "2:14:19s",
    "date": "5/6/2024",
    "status": "Verified"
  }
}
```

## Match Statistics Fetching

The `matches.js` script fetches match statistics for a given user from the MCSR Ranked API. It provides details such as the number of matches won, lost, drawn, and the total ELO change over a specified timeframe.

### Key Functions

- **fetchMatchStats(username, userUUID, startDate)**: Fetches match statistics for the given user.
- **parsePlaytime(playtime)**: Converts playtime from milliseconds to a human-readable format.
- **parseUptime(timeframe)**: Parses a human-readable timeframe into a Date object.
- **fetchUserData(username)**: Fetches user data from the MCSR Ranked API.
- **handler(req, res)**: Main handler function that processes the request and returns match statistics in JSON format.

### Example Usage

To fetch match statistics, send a GET request to the endpoint where `matches.js` is deployed with the following query parameters:

- `username`: The username of the player.
- `timeframe` (optional): The timeframe for which to fetch match statistics (e.g., "1 hour and 5 minutes").

The response will be a JSON object containing the match statistics.

### Example Response

```json
{
  "username": "doogile",
  "timeframe": "20 minutes",
  "startTime": "2024-10-18T05:14:09.677Z",
  "totalMatchesCount": 0,
  "wonMatchesCount": 0,
  "lossMatchesCount": 0,
  "totalEloChange": 0,
  "drawCount": 0,
  "currentElo": 2121,
  "currentRank": 3,
  "seasonWins": 221,
  "seasonLosses": 82,
  "seasonPlaytime": "50 hours and 39 minutes",
  "seasonPlayedMatches": 310
}
```

## Draftout Match Statistics Fetching

The `draftout.js` route fetches the Draftout stats API and returns competitive match statistics for a given user over a Twitch uptime timeframe.

### Endpoints

- `GET /api/draftout/leaderboard`: Returns the Draftout Elo leaderboard.
- `GET /api/draftout/leaderboard?top=3`: Returns only the first `top` leaderboard players. `top` must be a positive integer.
- `GET /api/draftout?username=Feinberg`: Returns the player's current Draftout Elo, rank, and overall competitive record with no timeframe match counts.
- `GET /api/draftout?username=Feinberg&timeframe=1%20hour%20and%205%20minutes`: Returns the player's Draftout competitive match stats since the stream uptime start.
- `GET /api/draftout/widget?username=Feinberg`: Returns Draftout stats formatted for the OBS widget.

### Example Leaderboard Response

```json
[
  {
    "username": "bing_pigs",
    "rank": 1,
    "elo": 1638
  },
  {
    "username": "Feinberg",
    "rank": 2,
    "elo": 1618
  }
]
```

### Example Stats Response

```json
{
  "username": "Feinberg",
  "timeframe": "1 hour and 5 minutes",
  "startTime": "2026-05-23T10:55:00.000Z",
  "totalMatchesCount": 3,
  "wonMatchesCount": 2,
  "lossMatchesCount": 1,
  "drawCount": 0,
  "totalEloChange": 11,
  "currentElo": 1539,
  "currentRank": 2,
  "overallMatches": 31,
  "overallWins": 28,
  "overallLosses": 2,
  "overallDraws": 1
}
```

### Example Widget Response

```json
{
  "username": "Feinberg",
  "currentElo": 1705,
  "currentRank": 1,
  "rankName": "Guardian I",
  "rankColor": "#45686e",
  "hasActiveSession": true,
  "session": {
    "totalMatchesCount": 7,
    "wonMatchesCount": 7,
    "lossMatchesCount": 0,
    "drawCount": 0,
    "totalEloChange": 72,
    "winRate": 100,
    "currentWinStreak": 7
  },
  "latestMatch": {
    "opponentUsername": "luxuryz",
    "result": "win",
    "playerScore": 13,
    "opponentScore": 9,
    "eloChange": 13
  },
  "overall": {
    "matches": 43,
    "wins": 40,
    "losses": 2,
    "draws": 1,
    "winRate": 95
  }
}
```

If `top` is invalid, `/api/draftout/leaderboard` returns `400`. If `username` is missing, `/api/draftout` and `/api/draftout/widget` return `400`. If the player is not found, they return `404`.

## Draftout OBS Widget

The app serves a browser-source widget for OBS. Use these paths on whatever host is serving the app:

- Config page: `/draftout-widget-config.html`
- Overlay page: `/draftout-widget.html`

Use the config page to choose:

- Draftout username
- Compact or expanded widget mode
- Session gap hours
- Refresh seconds
- Accent color

The config page generates the overlay URL and shows the recommended OBS browser source size.

Recommended OBS source sizes:

- Compact: `380 x 82`
- Expanded: `430 x 222`

The widget detects the current session by walking backward through recent Draftout competitive matches until it finds a gap larger than the configured session gap. If the newest match is older than the gap, session stats display as zeroes.

## Metrics

The app exposes Prometheus metrics on the metrics server, which defaults to `http://127.0.0.1:9100/metrics`.

Key app metrics include:

- `mcsr_http_requests_total{method, route, status_code}`
- `mcsr_http_request_duration_seconds{method, route, status_code}`
- `mcsr_http_requests_in_flight{method, route}`
- `mcsr_http_requests_aborted_total{method, route, abort_stage}`
- `mcsr_http_request_aborted_duration_seconds{method, route, abort_stage}`
- `mcsr_matches_requests_total{channel, status_code}`
- `mcsr_matches_requests_aborted_total{channel, abort_stage}`
- `mcsr_axolotl_rolls_total{channel, axolotl_name}`
- `mcsr_draftout_requests_total{channel, endpoint, status_code}`
- `mcsr_upstream_requests_total{upstream, operation, status_code}`
- `mcsr_upstream_request_duration_seconds{upstream, operation, status_code}`

Draftout channel labels are parsed from Fossabot or Nightbot headers when present and fall back to `anonymous`.

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/memerson12/MCSR-Ranked-Matches-Today.git
   ```
2. Install dependencies:
   ```sh
   cd MCSR-Ranked-Matches-Today
   pnpm install
   ```

## Environment Variables

Create a `.env` file in the root directory and add the following environment variables:

```env
SHEETS_KEY=your_google_sheets_api_key
```

## Running the Project

To start the project, run:

```sh
pnpm dev
```

This will start the development server. Use the configured app host and port to access the APIs and widget pages.

To run the test suite:

```sh
pnpm test
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any changes.
