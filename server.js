import "./tracing.cjs";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import matchesRouter from "./routes/matches.js";
import axolotlsRouter from "./routes/axolotls.js";
import worldRecordsRouter from "./routes/world_records.js";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("mcsr-stats");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.updateName(`${req.method} ${req.path}`);
    span.setAttribute("http.method", req.method);
    span.setAttribute("http.route", req.path);

    const nightbotChannel = req.headers["Nightbot-Channel"];
    const nightbotSendUser = req.headers["Nightbot-User"];

    const fossabotChannel = req.headers["x-fossabot-channellogin"];
    const fossabotSendUser = req.headers["x-fossabot-message-userlogin"];

    if (nightbotChannel) {
      span.setAttribute("twitch.channel", nightbotChannel);
    } else if (fossabotChannel) {
      span.setAttribute("twitch.channel", fossabotChannel);
    }

    if (nightbotSendUser) {
      span.setAttribute("twitch.user", nightbotSendUser);
    } else if (fossabotSendUser) {
      span.setAttribute("twitch.user", fossabotSendUser);
    }
  }
  // ?.updateName(`${req.method} ${req.path}`)
  // .setAttribute("httpRoute", req.path);
  next();
});

app.use("/api/matches", matchesRouter);
app.use("/api/axolotls", axolotlsRouter);
app.use("/api/world_records", worldRecordsRouter);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
