import express from "express";
import fetch from "node-fetch";
import { recordUpstreamRequest } from "../utils/metrics.js";

const router = express.Router();
const LEADERBOARD_URL = "https://draftoutmc.com/leaderboard";

router.get("/leaderboard", async (req, res) => {
  const top = getSingleQueryValue(req.query.top);

  if (req.query.top !== undefined && !isPositiveInteger(top)) {
    return res.status(400).json({ error: "top must be a positive integer" });
  }

  try {
    const leaderboard = await fetchLeaderboard();
    const limit = top === null ? leaderboard.length : Number(top);

    res.status(200).json(leaderboard.slice(0, limit));
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

router.get("/elo", async (req, res) => {
  const username = getSingleQueryValue(req.query.username);

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    const leaderboard = await fetchLeaderboard();
    const player = leaderboard.find(
      (entry) => entry.username.toLowerCase() === username.toLowerCase()
    );

    if (!player) {
      return res
        .status(404)
        .json({ error: `No Draftout Elo for ${username} was found` });
    }

    res.status(200).json(player);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

async function fetchLeaderboard() {
  const response = await recordUpstreamRequest(
    { upstream: "draftout", operation: "fetch_leaderboard" },
    () => fetch(LEADERBOARD_URL)
  );

  if (!response.ok) {
    throw new Error(`Draftout leaderboard returned ${response.status}`);
  }

  const html = await response.text();
  const leaderboard = parseLeaderboard(html);

  if (leaderboard.length === 0) {
    throw new Error("Unable to parse Draftout leaderboard");
  }

  return leaderboard;
}

function parseLeaderboard(html) {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  return rows
    .map(parseLeaderboardRow)
    .filter((entry) => entry !== null);
}

function parseLeaderboardRow(row) {
  const placement = parseIntegerCell(row, "td-rank");
  const username = parseTextCell(row, "td-name");
  const rank = parseTextCell(row, "td-rank-name");
  const elo = parseIntegerCell(row, "td-elo");

  if (!placement || !username || !rank || !elo) {
    return null;
  }

  return {
    placement,
    username,
    rank,
    elo,
  };
}

function parseTextCell(row, className) {
  const match = row.match(
    new RegExp(
      `<td[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`,
      "i"
    )
  );

  if (!match) return null;

  return decodeHtml(stripTags(match[1])).trim();
}

function parseIntegerCell(row, className) {
  const value = parseTextCell(row, className);
  if (!value) return null;

  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, "");
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isPositiveInteger(value) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function getSingleQueryValue(value) {
  if (Array.isArray(value)) {
    return getSingleQueryValue(value[0]);
  }

  return typeof value === "string" ? value.trim() : null;
}

export default router;
