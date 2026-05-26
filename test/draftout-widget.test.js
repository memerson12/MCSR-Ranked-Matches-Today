import assert from "node:assert/strict";
import test from "node:test";
import {
  getDraftoutWidgetOptions,
  summarizeDraftoutWidgetStats,
} from "../routes/draftout.js";

const baseNow = new Date("2026-05-25T20:00:00.000Z");

test("summarizeDraftoutWidgetStats includes contiguous matches until a gap boundary", () => {
  const summary = summarizeDraftoutWidgetStats("Feinberg", pagesWithMatches([
    match({
      id: 4,
      completedAt: "2026-05-25T19:30:00.000Z",
      opponent: "latest",
      playerWon: true,
      playerScore: 13,
      opponentScore: 9,
      eloChange: 13,
    }),
    match({
      id: 3,
      completedAt: "2026-05-25T18:00:00.000Z",
      opponent: "second",
      playerWon: true,
      playerScore: 13,
      opponentScore: 8,
      eloChange: 8,
    }),
    match({
      id: 2,
      completedAt: "2026-05-25T12:30:00.000Z",
      opponent: "third",
      playerWon: false,
      playerScore: 7,
      opponentScore: 13,
      eloChange: -10,
    }),
    match({
      id: 1,
      completedAt: "2026-05-25T05:00:00.000Z",
      opponent: "old",
      playerWon: true,
      playerScore: 13,
      opponentScore: 1,
      eloChange: 6,
    }),
  ]), { gapHours: 6, now: baseNow });

  assert.equal(summary.hasActiveSession, true);
  assert.equal(summary.session.totalMatchesCount, 3);
  assert.equal(summary.session.wonMatchesCount, 2);
  assert.equal(summary.session.lossMatchesCount, 1);
  assert.equal(summary.session.drawCount, 0);
  assert.equal(summary.session.totalEloChange, 11);
  assert.equal(summary.session.winRate, 67);
  assert.equal(summary.session.currentWinStreak, 2);
  assert.equal(summary.latestMatch.opponentUsername, "latest");
});

test("summarizeDraftoutWidgetStats reports no active session when newest match is older than the gap", () => {
  const summary = summarizeDraftoutWidgetStats("Feinberg", pagesWithMatches([
    match({
      id: 1,
      completedAt: "2026-05-25T13:30:00.000Z",
      opponent: "old",
      playerWon: true,
      playerScore: 13,
      opponentScore: 9,
      eloChange: 11,
    }),
  ]), { gapHours: 6, now: baseNow });

  assert.equal(summary.hasActiveSession, false);
  assert.equal(summary.session.totalMatchesCount, 0);
  assert.equal(summary.session.wonMatchesCount, 0);
  assert.equal(summary.session.lossMatchesCount, 0);
  assert.equal(summary.session.drawCount, 0);
  assert.equal(summary.session.totalEloChange, 0);
  assert.equal(summary.session.currentWinStreak, 0);
});

test("summarizeDraftoutWidgetStats stops current win streak on a draw", () => {
  const summary = summarizeDraftoutWidgetStats("Feinberg", pagesWithMatches([
    match({
      id: 3,
      completedAt: "2026-05-25T19:30:00.000Z",
      opponent: "latest",
      playerWon: true,
      playerScore: 13,
      opponentScore: 9,
      eloChange: 13,
    }),
    match({
      id: 2,
      completedAt: "2026-05-25T18:30:00.000Z",
      opponent: "drawn",
      outcome: "draw_by_vote",
      playerWon: false,
      playerScore: 8,
      opponentScore: 8,
      eloChange: -2,
    }),
    match({
      id: 1,
      completedAt: "2026-05-25T17:30:00.000Z",
      opponent: "older-win",
      playerWon: true,
      playerScore: 13,
      opponentScore: 9,
      eloChange: 9,
    }),
  ]), { gapHours: 6, now: baseNow });

  assert.equal(summary.session.currentWinStreak, 1);
  assert.equal(summary.session.drawCount, 1);
});

test("getDraftoutWidgetOptions normalizes defaults and invalid query values", () => {
  assert.deepEqual(getDraftoutWidgetOptions({}), {
    mode: "compact",
    gapHours: 6,
    refreshSeconds: 30,
    accent: "#58d5e8",
  });

  assert.deepEqual(
    getDraftoutWidgetOptions({
      mode: "expanded",
      gapHours: "3.5",
      refreshSeconds: "10",
      accent: "ff8800",
    }),
    {
      mode: "expanded",
      gapHours: 3.5,
      refreshSeconds: 10,
      accent: "#ff8800",
    }
  );

  assert.equal(
    getDraftoutWidgetOptions({ mode: "ultra_compact" }).mode,
    "ultra_compact"
  );

  assert.equal(getDraftoutWidgetOptions({ mode: "bad-mode" }).mode, "compact");
});

function pagesWithMatches(matches) {
  return [
    {
      player: {
        uuid: "player-uuid",
        username: "Feinberg",
        elo: 1705,
        rank: 1,
        rankName: "Guardian I",
        rankColor: "#45686e",
      },
      record: {
        matches: 43,
        wins: 40,
        losses: 2,
        draws: 1,
        winRate: 0.95,
      },
      aggregate: {
        peakElo: 1705,
        bestStreak: 18,
      },
      matches,
    },
  ];
}

function match({
  id,
  completedAt,
  opponent,
  outcome = "finished",
  playerWon,
  playerScore,
  opponentScore,
  eloChange,
}) {
  return {
    id,
    matchType: "competitive",
    outcome,
    completedAt: new Date(completedAt).getTime(),
    durationMs: 1200000,
    participants: [
      {
        uuid: "player-uuid",
        username: "Feinberg",
        won: playerWon,
        score: playerScore,
        eloBefore: 1600,
        eloChange,
        eloAfter: 1600 + eloChange,
      },
      {
        uuid: `${opponent}-uuid`,
        username: opponent,
        won: outcome.startsWith("draw") ? false : !playerWon,
        score: opponentScore,
        eloBefore: 1500,
        eloChange: -eloChange,
        eloAfter: 1500 - eloChange,
      },
    ],
  };
}
