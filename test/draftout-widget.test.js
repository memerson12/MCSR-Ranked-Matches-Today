import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getDraftoutWidgetOptions,
  summarizeDraftoutWidgetStats,
} from "../routes/draftout.js";

const baseNow = new Date("2026-05-25T20:00:00.000Z");
const widgetHtml = readFileSync("public/draftout-widget.html", "utf8");
const configHtml = readFileSync("public/draftout-widget-config.html", "utf8");

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
  assert.deepEqual(summary.session.eloTrend, [0, -10, -2, 11]);
  assert.equal(summary.latestMatch.opponentUsername, "latest");
});

test("summarizeDraftoutWidgetStats reports no active session while preserving current win streak", () => {
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
  assert.equal(summary.session.currentWinStreak, 1);
  assert.deepEqual(summary.session.eloTrend, [0]);
});

test("summarizeDraftoutWidgetStats does not stop current win streak on a draw", () => {
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

  assert.equal(summary.session.currentWinStreak, 2);
  assert.equal(summary.session.drawCount, 1);
});

test("summarizeDraftoutWidgetStats counts current win streak beyond the active session", () => {
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
      completedAt: "2026-05-25T10:00:00.000Z",
      opponent: "before-gap",
      playerWon: true,
      playerScore: 13,
      opponentScore: 8,
      eloChange: 8,
    }),
    match({
      id: 1,
      completedAt: "2026-05-25T09:00:00.000Z",
      opponent: "last-loss",
      playerWon: false,
      playerScore: 7,
      opponentScore: 13,
      eloChange: -10,
    }),
  ]), { gapHours: 6, now: baseNow });

  assert.equal(summary.session.totalMatchesCount, 1);
  assert.equal(summary.session.currentWinStreak, 2);
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

test("compact and expanded widget templates render the shared rank badge", () => {
  const compactTemplate = htmlBetween(
    "function compactTemplate(data)",
    "function expandedTemplate(data)"
  );
  const expandedTemplate = htmlBetween(
    "function expandedTemplate(data)",
    "function latestMeta(latest)"
  );

  assert.match(compactTemplate, /rankBadge\(data\)/);
  assert.match(expandedTemplate, /rankBadge\(data\)/);
});

test("widget templates use ungrouped elo formatting", () => {
  assert.match(widgetHtml, /function formatElo\(value\)/);
  assert.doesNotMatch(widgetHtml, /toLocaleString/);
  assert.doesNotMatch(widgetHtml, /formatNumber\(data\.currentElo\)/);
});

test("compact widget renders current win streak between WLD and session", () => {
  const compactTemplate = htmlBetween(
    "function compactTemplate(data)",
    "function expandedTemplate(data)"
  );

  assert.match(compactTemplate, /compact-stat-group/);
  assert.match(compactTemplate, /is-streak/);
  assert.match(compactTemplate, /session\.currentWinStreak/);
  assert.match(compactTemplate, /is-session/);
  assert.match(compactTemplate, /config\.showWinStreak/);
  assert.match(compactTemplate, /without-streak/);
});

test("compact widget renders the session ELO trend beside its delta", () => {
  const compactTemplate = htmlBetween(
    "function compactTemplate(data)",
    "function expandedTemplate(data)"
  );

  assert.match(compactTemplate, /sessionEloChart\(session\.eloTrend\)/);
  assert.match(compactTemplate, /config\.showEloGraph/);
  assert.match(compactTemplate, /without-chart/);
  assert.match(compactTemplate, /elo-session/);
  assert.match(widgetHtml, /class="elo-chart"/);
  assert.match(widgetHtml, /elo-fill-positive/);
  assert.match(widgetHtml, /elo-fill-negative/);
  assert.match(widgetHtml, /class="elo-point"/);
  assert.doesNotMatch(widgetHtml, /class="elo-point \$\{direction\}"/);
  assert.match(widgetHtml, /points\s*\.slice\(1\)\s*\.map/);
  assert.match(widgetHtml, /pointSpacing \* 0\.35/);
  assert.match(widgetHtml, /\.elo-point\s*\{[\s\S]*?fill: var\(--muted\)/);
  assert.match(widgetHtml, /stop-opacity="0\.42"/);
  assert.match(widgetHtml, /const bottomFadeSpace = 3/);
  assert.match(widgetHtml, /height - padding - bottomFadeSpace/);
  assert.match(widgetHtml, /offset="60%"[\s\S]*?stop-opacity="0\.42"/);

  const chartRenderer = htmlBetween(
    "function sessionEloChart(trend)",
    "function eloTrendDomain(values)"
  );
  assert.ok(
    chartRenderer.indexOf('${lines.join("")}') <
      chartRenderer.indexOf('${pointMarkers.join("")}'),
    "match dots should render after the line"
  );
  assert.match(chartRenderer, /const areaRuns = \[\]/);
  assert.match(chartRenderer, /currentArea\?\.direction === direction/);
  assert.doesNotMatch(chartRenderer, /areas\.push\(/);
});

test("compact widget and configurator agree on the OBS source height", () => {
  assert.match(widgetHtml, /\.compact\s*\{[\s\S]*?height: 112px/);
  assert.match(configHtml, /"380 x 112"/);
});

test("compact configurator defaults graph and win streak controls on", () => {
  assert.match(configHtml, /id="showEloGraph" type="checkbox" checked/);
  assert.match(configHtml, /id="showWinStreak" type="checkbox" checked/);
  assert.match(configHtml, /params\.set\("showEloGraph"/);
  assert.match(configHtml, /params\.set\("showWinStreak"/);
  assert.match(widgetHtml, /booleanParam\(params\.get\("showEloGraph"\), true\)/);
  assert.match(widgetHtml, /booleanParam\(params\.get\("showWinStreak"\), true\)/);
  assert.match(configHtml, /\.option-tile\s*\{[\s\S]*?user-select: none/);
});

test("expanded widget keeps record values on one line", () => {
  const expandedTemplate = htmlBetween(
    "function expandedTemplate(data)",
    "function latestMeta(latest)"
  );

  assert.match(widgetHtml, /\.value\.is-record[\s\S]*white-space: nowrap/);
  assert.match(expandedTemplate, /label">W-L-D<\/div><div class="value is-record"/);
  assert.match(expandedTemplate, /label">Overall<\/div><div class="value is-record"/);
});

function htmlBetween(startMarker, endMarker) {
  const start = widgetHtml.indexOf(startMarker);
  const end = widgetHtml.indexOf(endMarker, start);

  assert.notEqual(start, -1, `${startMarker} should exist`);
  assert.notEqual(end, -1, `${endMarker} should exist`);

  return widgetHtml.slice(start, end);
}

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
