import assert from "node:assert/strict";
import test from "node:test";
import {
  metricsHandler,
  recordDraftoutWidgetSessionState,
} from "../utils/metrics.js";

test("Draftout widget session metrics expose active state and observation time", async () => {
  recordDraftoutWidgetSessionState(" MetricUser ", true, 1_725_000_000_000);

  let metrics = "";
  await metricsHandler(null, {
    set() {},
    end(value) {
      metrics = value;
    },
  });

  assert.match(
    metrics,
    /mcsr_draftout_widget_session_active\{username="metricuser"\} 1/,
  );
  assert.match(
    metrics,
    /mcsr_draftout_widget_session_last_seen_timestamp_seconds\{username="metricuser"\} 1725000000/,
  );
});
