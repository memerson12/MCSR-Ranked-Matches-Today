import "dotenv/config";
import "./utils/tracing.cjs";

import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import matchesRouter from "./routes/matches.js";
import axolotlsRouter from "./routes/axolotls.js";
import worldRecordsRouter from "./routes/world_records.js";
import { trace } from "@opentelemetry/api";
import { metricsHttpHandler, metricsMiddleware } from "./utils/metrics.js";
import {
  getChannelFromHeaders,
  getUsernameFromHeaders,
} from "./utils/headers_parser.js";

const tracer = trace.getTracer("mcsr-stats");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const METRICS_HOST = process.env.METRICS_HOST || "127.0.0.1";
const METRICS_PORT = process.env.METRICS_PORT || 9100;

app.use(express.static(path.join(__dirname, "public")));
app.use(metricsMiddleware);

app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.updateName(`${req.method} ${req.path}`);
    span.setAttribute("http.method", req.method);
    span.setAttribute("http.route", req.path);
    span.setAttribute("http.headers", req.headers);

    const twitchChannel = getChannelFromHeaders(req.headers);
    const senderUsername = getUsernameFromHeaders(req.headers);

    if (twitchChannel) {
      span.setAttribute("twitch.channel", twitchChannel);
    }

    if (senderUsername) {
      span.setAttribute("twitch.user", senderUsername);
    }
  }
  next();
});

app.use("/api/matches", matchesRouter);
app.use("/api/axolotls", axolotlsRouter);
app.use("/api/world_records", worldRecordsRouter);

app.get("/health", (req, res) => {
  const healthcheck = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  };

  try {
    res.status(200).json(healthcheck);
  } catch (error) {
    healthcheck.status = "error";
    healthcheck.message = error.message;
    res.status(503).json(healthcheck);
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

http.createServer(metricsHttpHandler).listen(METRICS_PORT, METRICS_HOST, () => {
  console.log(`Metrics server is running on http://${METRICS_HOST}:${METRICS_PORT}`);
});
