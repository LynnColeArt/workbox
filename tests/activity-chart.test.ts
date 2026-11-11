import assert from "node:assert/strict";
import { test } from "node:test";
import { activitySnapshot, parseDay, parsePage, utcDayRange } from "../src/lib/workbox/activity-chart";
import type { ActivityChartModel } from "../src/lib/workbox/activity-chart";
import { renderActivityChartPng, renderActivityChartSvg } from "../src/lib/workbox/activity-chart-svg";

function chart(kind: ActivityChartModel["kind"]): ActivityChartModel {
  return {
    kind,
    title: "Repository <script> activity & review",
    unit: "commits",
    timezone: "UTC",
    startDay: "2024-02-27",
    endDay: "2024-03-01",
    selectedDay: "2024-02-29",
    buckets: [
      { day: "2024-02-27", count: 0, href: "/explore?day=2024-02-27" },
      { day: "2024-02-28", count: null, href: "/explore?day=2024-02-28" },
      { day: "2024-02-29", count: 2, href: "/explore?day=2024-02-29", partial: true },
      { day: "2024-03-01", count: 1, href: "/explore?day=2024-03-01" },
    ],
  };
}

test("normalizes dates, days and pagination across both consumers", () => {
  assert.deepEqual(utcDayRange(4, new Date("2024-02-29T19:30:00-06:00")), [
    "2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01",
  ]);
  assert.equal(parseDay("2024-02-29"), "2024-02-29");
  assert.equal(parseDay("2023-02-29"), null);
  assert.equal(parseDay("2024-04-31"), null);
  assert.equal(parseDay("2024-03-01T00:00:00Z"), null);
  assert.equal(parseDay(["2024-03-01"]), null);
  assert.equal(parsePage("4"), 4);
  assert.equal(parsePage(4), 4);
  for (const value of [0, -1, 2.5, "2.5", "1e3", ["4"], "9007199254740992"]) {
    assert.equal(parsePage(value), 1);
  }
  assert.equal(activitySnapshot(["A", 0]), activitySnapshot(["A", 0]));
  assert.notEqual(activitySnapshot(["A", 0]), activitySnapshot(["A", null]));
});

test("renders self-contained line and calendar SVGs with exact selection context", () => {
  const line = renderActivityChartSvg(chart("line"));
  const calendar = renderActivityChartSvg(chart("calendar"));
  for (const svg of [line, calendar]) {
    assert.match(svg, /^<svg /);
    assert.match(svg, /2024-02-27 – 2024-03-01 \(UTC\)/);
    assert.match(svg, /2024-02-29 · At least 2 commits/);
    assert.match(svg, /Amber indicates partial data/);
    assert.match(svg, /&lt;script&gt; activity &amp; review/);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)="(?:https?:|\/\/)|\/explore\?/i);
  }
  assert.match(line, /Gaps indicate unknown activity/);
  assert.match(calendar, />Unknown<\/text>/);
  assert.match(calendar, /fill="#59636e"/);
  assert.match(calendar, /fill="#30363d"/);
});

test("renders a locally decodable PNG for MCP image consumers", async () => {
  const png = await renderActivityChartPng(chart("calendar"));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 840);
  assert.equal(png.readUInt32BE(20), 228);
});
