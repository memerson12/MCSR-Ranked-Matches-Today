# MCSR Ranked Matches Today

This project provides APIs to fetch Minecraft Speedrun (MCSR) ranked match statistics and world records. It includes two main functionalities:

1. **World Records Fetching** (`world_records.js`)
2. **Match Statistics Fetching** (`matches.js`)

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

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/MCSR-Ranked-Matches-Today.git
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
npm run dev
```

This will start the development server, and you can access the APIs at `http://localhost:3000`.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any changes.
