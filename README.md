# MCSR Ranked Matches Today

This project provides an API endpoint to fetch and analyze the ranked matches of a Minecraft Speedrunning (MCSR) player within a specified timeframe. The API aggregates match data, calculates the number of matches won and lost, and tracks the ELO changes.

## Features

- Fetches match data for a specified player.
- Parses and validates the timeframe input.
- Calculates the total number of matches, wins, losses, and ELO changes within the timeframe.
- Handles pagination to fetch all relevant matches.

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/MCSR-Ranked-Matches-Today.git
   ```
2. Navigate to the project directory:
   ```sh
   cd MCSR-Ranked-Matches-Today
   ```
3. Install the dependencies:
   ```sh
   npm install
   ```

## Usage

To start the server, run:

```sh
npm run dev
```

The API endpoint can be accessed at:

```
http://localhost:3000/api/matches?username=<username>&timeframe=<timeframe>
```

### Example Request

```
http://localhost:3000/api/matches?username=doogile&timeframe=1%20hour%20and%205%20minutes
```

### Example Response

```json
{
  "username": "doogile",
  "userUUID": "some-uuid",
  "timeframe": "1 hour and 5 minutes",
  "startTime": "2023-10-01T12:34:56.789Z",
  "totalMatchesCount": 10,
  "wonMatchesCount": 6,
  "lossMatchesCount": 4,
  "totalEloChange": 15
}
```

## Parameters

- `username`: The Minecraft username of the player.
- `timeframe`: The timeframe to fetch matches for (e.g., `1 hour and 5 minutes`).

## Error Handling

The API will return appropriate error messages for invalid requests, such as missing parameters or invalid timeframe formats.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any changes or improvements.

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.
