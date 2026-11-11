export function parseUptime(timeframe, now = new Date()) {
  if (typeof timeframe !== "string") return null;
  const input = timeframe.trim();
  if (!/^\d+\s*(?:hours?|minutes?|seconds?)(?:(?:\s+and\s+|,\s*|\s+)\d+\s*(?:hours?|minutes?|seconds?))*$/i.test(input)) {
    return null;
  }
  let seconds = 0;
  for (const [, value, unit] of input.matchAll(/(\d+)\s*(hour|minute|second)s?/gi)) {
    seconds += Number(value) * ({ hour: 3600, minute: 60, second: 1 }[unit.toLowerCase()]);
  }
  const start = new Date(now.getTime() - seconds * 1000);
  return Number.isFinite(start.getTime()) ? start : null;
}

