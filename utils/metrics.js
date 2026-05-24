import client from "prom-client";
import { trace } from "@opentelemetry/api";

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

const httpRequestsAbortedTotal = new client.Counter({
  name: "mcsr_http_requests_aborted_total",
  help: "Total HTTP requests aborted before a response completed.",
  labelNames: ["method", "route", "abort_stage"],
  registers: [register],
});

const httpRequestAbortedDurationSeconds = new client.Histogram({
  name: "mcsr_http_request_aborted_duration_seconds",
  help: "HTTP request duration in seconds before the client disconnected.",
  labelNames: ["method", "route", "abort_stage"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
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

const matchesRequestsAbortedTotal = new client.Counter({
  name: "mcsr_matches_requests_aborted_total",
  help: "Total matches endpoint requests aborted before a response completed.",
  labelNames: ["channel", "abort_stage"],
  registers: [register],
});

const draftoutRequestsTotal = new client.Counter({
  name: "mcsr_draftout_requests_total",
  help: "Total Draftout endpoint requests by channel, endpoint, and response status.",
  labelNames: ["channel", "endpoint", "status_code"],
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
  if (req.path === "/api/draftout") return "/api/draftout";
  return "unmatched";
}

function createRequestContext(req, res, route) {
  const abortController = new AbortController();
  const lifecycleRecorders = [];
  const logContext = {};
  let stage = "unknown";

  const getElapsedMs = () =>
    Number(process.hrtime.bigint() - res.locals.requestStartedAt) / 1e6;

  return {
    signal: abortController.signal,
    abortController,
    setStage(nextStage) {
      stage = nextStage || "unknown";
      res.locals.abortStage = stage;
    },
    getStage() {
      return stage;
    },
    setLogContext(fields = {}) {
      Object.assign(logContext, fields);
    },
    getLogContext() {
      return { ...logContext };
    },
    addLifecycleRecorder(recorder) {
      lifecycleRecorders.push(recorder);
    },
    emitLifecycle(eventType, payload) {
      for (const recorder of lifecycleRecorders) {
        if (eventType === "finish") {
          recorder.onFinish?.(payload);
          continue;
        }

        recorder.onAbort?.(payload);
      }
    },
    log(level, event, extra = {}) {
      console[level](
        JSON.stringify({
          event,
          route,
          abort_stage: stage,
          elapsed_ms: getElapsedMs(),
          ...logContext,
          ...extra,
        })
      );
    },
  };
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
  const requestStartedAt = process.hrtime.bigint();
  const span = trace.getActiveSpan();
  const requestContext = createRequestContext(req, res, inFlightLabels.route);
  let finalized = false;

  res.locals.requestStartedAt = requestStartedAt;
  res.locals.abortStage = "unknown";
  res.locals.requestContext = requestContext;
  httpRequestsInFlight.inc(inFlightLabels);

  const finalize = (eventType, abortReason) => {
    if (finalized) return;
    finalized = true;

    const abortStage = requestContext.getStage();
    const durationSeconds = Number(process.hrtime.bigint() - requestStartedAt) / 1e9;
    httpRequestsInFlight.dec(inFlightLabels);

    if (eventType === "finish") {
      const labels = {
        ...inFlightLabels,
        status_code: String(res.statusCode),
      };

      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, durationSeconds);
      requestContext.log("info", "http_request_completed", {
        method: req.method,
        status_code: res.statusCode,
        duration_ms: durationSeconds * 1000,
      });
      requestContext.emitLifecycle("finish", {
        statusCode: res.statusCode,
        durationSeconds,
      });
      return;
    }

    const abortLabels = {
      ...inFlightLabels,
      abort_stage: abortStage,
    };

    httpRequestsAbortedTotal.inc(abortLabels);
    httpRequestAbortedDurationSeconds.observe(abortLabels, durationSeconds);

    if (!requestContext.signal.aborted) {
      requestContext.abortController.abort(abortReason);
    }

    if (span) {
      span.setAttribute("request.aborted", true);
      span.setAttribute("request.abort_stage", abortStage);
      span.setAttribute("request.abort_reason", abortReason || "aborted");
      span.addEvent("request.aborted", {
        "request.abort_stage": abortStage,
        "request.abort_reason": abortReason || "aborted",
      });
    }

    requestContext.log("warn", "http_request_aborted", {
      abort_reason: abortReason || "aborted",
      method: req.method,
      duration_ms: durationSeconds * 1000,
    });
    requestContext.emitLifecycle("abort", {
      abortStage,
      abortReason: abortReason || "aborted",
      durationSeconds,
    });
  };

  res.on("finish", () => {
    finalize("finish");
  });

  req.on("aborted", () => {
    finalize("aborted", "client_aborted");
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      finalize("aborted", "client_closed");
    }
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

export function recordMatchesAbort(channel, abortStage) {
  matchesRequestsAbortedTotal.inc({
    channel: channel || "anonymous",
    abort_stage: abortStage || "unknown",
  });
}

export function getRequestContext(res) {
  return res.locals.requestContext;
}

export function instrumentMatchesRequest(requestContext, { channel }) {
  requestContext.addLifecycleRecorder({
    onFinish: ({ statusCode }) => {
      recordMatchesRequest(channel, statusCode);
    },
    onAbort: ({ abortStage }) => {
      recordMatchesAbort(channel, abortStage);
    },
  });
}

export function recordDraftoutRequest(channel, endpoint, statusCode) {
  draftoutRequestsTotal.inc({
    channel: channel || "anonymous",
    endpoint,
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
  } catch (error) {
    if (error?.name === "AbortError") {
      statusCode = "aborted";
    }
    throw error;
  } finally {
    const metricLabels = {
      ...labels,
      status_code: statusCode,
    };

    upstreamRequestsTotal.inc(metricLabels);
    endTimer(metricLabels);
  }
}
