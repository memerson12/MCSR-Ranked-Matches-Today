import express from "express";
import db from "../db/init.js";
import {
  getUsernameFromHeaders,
  getChannelFromHeaders,
} from "../utils/HeadersParser.js";

const router = express.Router();

const axolotls = [
  {
    name: "axoDance",
    chance: 0.305833,
  },
  {
    name: "axoDance2",
    chance: 0.305833,
  },
  {
    name: "axoDance3",
    chance: 0.305833,
  },
  {
    name: "axoDance4",
    chance: 0.0825,
  },
  {
    name: "RAREAxolotl",
    chance: 0.0008333333333,
  },
  {
    name: "SECRETAxolotl",
    chance: 0.0001,
  },
];

function pickAxolotl(axolotls) {
  // Calculate the total sum of chances
  const totalChance = axolotls.reduce(
    (sum, axolotl) => sum + axolotl.chance,
    0
  );

  // Generate a random number between 0 and totalChance
  const randomChance = Math.random() * totalChance;

  // Iterate through the array to find where the randomChance falls
  let cumulativeChance = 0;
  for (const axolotl of axolotls) {
    cumulativeChance += axolotl.chance;
    if (randomChance <= cumulativeChance) {
      return axolotl.name;
    }
  }

  return {
    name: "impossibleAxolotl",
    chance: 0,
  };
}

router.get("/", (req, res) => {
  const username = getUsernameFromHeaders(req.headers) || "anonymous";
  const channel = getChannelFromHeaders(req.headers) || "anonymous";
  const axolotl = pickAxolotl(axolotls);
  console.log(username, channel, axolotl);
  const stmt = db.prepare(
    "INSERT INTO axolotl_rolls (username, channel, axolotl_name) VALUES (?, ?, ?)"
  );
  stmt.run(username, channel, axolotl);

  res.status(200).send(axolotl);
});

router.get("/stats", (req, res) => {
  const { username, channel } = req.query;

  // If no username provided, return the leaderboard
  if (!username) {
    const query = channel
      ? `
        SELECT 
          username,
          COUNT(*) as total_rolls,
          COUNT(DISTINCT axolotl_name) as unique_axolotls,
          MAX(CASE WHEN axolotl_name IN ('RAREAxolotl', 'SECRETAxolotl') THEN 1 ELSE 0 END) as has_rare,
          MIN(timestamp) as first_roll,
          MAX(timestamp) as last_roll
        FROM axolotl_rolls 
        WHERE username != 'anonymous' AND channel = ?
        GROUP BY username
        ORDER BY total_rolls DESC
        LIMIT 100
      `
      : `
        SELECT 
          username,
          COUNT(*) as total_rolls,
          COUNT(DISTINCT axolotl_name) as unique_axolotls,
          MAX(CASE WHEN axolotl_name IN ('RAREAxolotl', 'SECRETAxolotl') THEN 1 ELSE 0 END) as has_rare,
          MIN(timestamp) as first_roll,
          MAX(timestamp) as last_roll
        FROM axolotl_rolls 
        WHERE username != 'anonymous'
        GROUP BY username
        ORDER BY total_rolls DESC
        LIMIT 100
      `;

    const leaderboard = channel
      ? db.prepare(query).all(channel)
      : db.prepare(query).all();

    const totalRollsQuery = channel
      ? "SELECT COUNT(*) as count FROM axolotl_rolls WHERE channel = ?"
      : "SELECT COUNT(*) as count FROM axolotl_rolls";

    const uniqueUsersQuery = channel
      ? `SELECT COUNT(DISTINCT username) as count FROM axolotl_rolls WHERE username != 'anonymous' AND channel = ?`
      : `SELECT COUNT(DISTINCT username) as count FROM axolotl_rolls WHERE username != 'anonymous'`;

    const totalRolls = channel
      ? db.prepare(totalRollsQuery).get(channel).count
      : db.prepare(totalRollsQuery).get().count;

    const uniqueUsers = channel
      ? db.prepare(uniqueUsersQuery).get(channel).count
      : db.prepare(uniqueUsersQuery).get().count;

    const channelStats = db
      .prepare(
        `
      SELECT 
        channel,
        COUNT(*) as total_rolls,
        COUNT(DISTINCT username) as unique_users
      FROM axolotl_rolls 
      WHERE channel != 'unknown'
      GROUP BY channel
      ORDER BY total_rolls DESC
      LIMIT 10
    `
      )
      .all();

    return res.status(200).json({
      total_rolls: totalRolls,
      unique_users: uniqueUsers,
      top_channels: channelStats,
      leaderboard: leaderboard.map((user) => ({
        username: user.username,
        total_rolls: user.total_rolls,
        unique_axolotls: user.unique_axolotls,
        has_rare: user.has_rare === 1,
        first_roll: user.first_roll,
        last_roll: user.last_roll,
      })),
    });
  }

  // If username provided, return their personal stats
  const statsQuery = channel
    ? `
      SELECT 
        COUNT(*) as total_rolls,
        axolotl_name,
        COUNT(*) * 100.0 / (SELECT COUNT(*) FROM axolotl_rolls WHERE username = ? AND channel = ?) as percentage
      FROM axolotl_rolls 
      WHERE username = ? AND channel = ?
      GROUP BY axolotl_name
      ORDER BY COUNT(*) DESC
    `
    : `
      SELECT 
        COUNT(*) as total_rolls,
        axolotl_name,
        COUNT(*) * 100.0 / (SELECT COUNT(*) FROM axolotl_rolls WHERE username = ?) as percentage
      FROM axolotl_rolls 
      WHERE username = ?
      GROUP BY axolotl_name
      ORDER BY COUNT(*) DESC
    `;

  const stats = channel
    ? db.prepare(statsQuery).all(username, channel, username, channel)
    : db.prepare(statsQuery).all(username, username);

  const totalRollsQuery = channel
    ? "SELECT COUNT(*) as count FROM axolotl_rolls WHERE username = ? AND channel = ?"
    : "SELECT COUNT(*) as count FROM axolotl_rolls WHERE username = ?";

  const totalRolls = channel
    ? db.prepare(totalRollsQuery).get(username, channel).count
    : db.prepare(totalRollsQuery).get(username).count;

  const userChannels = db
    .prepare(
      `
    SELECT 
      channel,
      COUNT(*) as rolls,
      MIN(timestamp) as first_roll,
      MAX(timestamp) as last_roll
    FROM axolotl_rolls 
    WHERE username = ? AND channel != 'unknown'
    GROUP BY channel
    ORDER BY rolls DESC
  `
    )
    .all(username);

  res.status(200).json({
    username,
    totalRolls,
    channels: userChannels,
    rolls: stats,
  });
});

export default router;
