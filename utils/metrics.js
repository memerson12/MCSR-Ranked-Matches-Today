import client from "prom-client";

const register = new client.Registry();

client.collectDefaultMetrics({
  prefix: "mcsr_",
  register,
});

const ignoredPaths = new Set(["/metrics", "/health", "/favicon.ico"]);

const httpRequestsTotal = new client.Counter({
  name: "mcsr_http_requests_total",
  help: "Total HTTP requests handled by the app.",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "mcsr_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsInFlight = new client.Gauge({
  name: "mcsr_http_requests_in_flight",
  help: "HTTP requests currently being handled by the app.",
  labelNames: ["method", "route"],
  registers: [register],
});

const axolotlRollsTotal = new client.Counter({
  name: "mcsr_axolotl_rolls_total",
  help: "Total axolotl rolls by channel and roll result.",
  labelNames: ["channel", "axolotl_name"],
  registers: [register],
});

const matchesRequestsTotal = new client.Counter({
  name: "mcsr_matches_requests_total",
  help: "Total matches endpoint requests by channel and response status.",
  labelNames: ["channel", "status_code"],
  registers: [register],
});

const upstreamRequestsTotal = new client.Counter({
  name: "mcsr_upstream_requests_total",
  help: "Total upstream HTTP requests made by the app.",
  labelNames: ["upstream", "operation", "status_code"],
  registers: [register],
});

const upstreamRequestDurationSeconds = new client.Histogram({
  name: "mcsr_upstream_request_duration_seconds",
  help: "Upstream HTTP request duration in seconds.",
  labelNames: ["upstream", "operation", "status_code"],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

function routeLabelFor(req) {
  if (req.path === "/") return "/";
  if (req.path === "/api/axolotls/stats") return "/api/axolotls/stats";
  if (req.path === "/api/axolotls") return "/api/axolotls";
  if (req.path === "/api/matches") return "/api/matches";
  if (req.path === "/api/world_records") return "/api/world_records";
  return "unmatched";
}

export function metricsMiddleware(req, res, next) {
  if (ignoredPaths.has(req.path)) {
    next();
    return;
  }

  const inFlightLabels = {
    method: req.method,
    route: routeLabelFor(req),
  };
  const start = process.hrtime.bigint();

  httpRequestsInFlight.inc(inFlightLabels);

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      ...inFlightLabels,
      status_code: String(res.statusCode),
    };

    httpRequestsInFlight.dec(inFlightLabels);
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
}

export async function metricsHandler(req, res) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}

export async function metricsHttpHandler(req, res) {
  if (req.method !== "GET" || req.url !== "/metrics") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  try {
    res.writeHead(200, { "Content-Type": register.contentType });
    res.end(await register.metrics());
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Error collecting metrics");
  }
}

export function recordAxolotlRoll(channel, axolotlName) {
  axolotlRollsTotal.inc({
    channel: channel || "anonymous",
    axolotl_name: axolotlName,
  });
}

export function recordMatchesRequest(channel, statusCode) {
  matchesRequestsTotal.inc({
    channel: channel || "anonymous",
    status_code: String(statusCode),
  });
}

export async function recordUpstreamRequest(labels, requestFn) {
  const endTimer = upstreamRequestDurationSeconds.startTimer();
  let statusCode = "error";

  try {
    const response = await requestFn();
    statusCode = String(response.status ?? "unknown");
    return response;
  } finally {
    const metricLabels = {
      ...labels,
      status_code: statusCode,
    };

    upstreamRequestsTotal.inc(metricLabels);
    endTimer(metricLabels);
  }
}
