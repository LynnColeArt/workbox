import { BarChart, type BarSeriesOption } from "echarts/charts";
import { LegendComponent, type GridComponentOption, type LegendComponentOption, type TitleComponentOption } from "echarts/components";
import { use as registerChartComponents, type ComposeOption } from "echarts/core";
import sharp from "sharp";
import { initActivityChart } from "./activity-chart-options";
import type { DashboardRead } from "./dashboard";

registerChartComponents([BarChart, LegendComponent]);

type DashboardChartOptions = ComposeOption<
  BarSeriesOption | GridComponentOption | LegendComponentOption | TitleComponentOption
>;

const text = "#e6edf3";
const muted = "#aab3bd";
const border = "#30363d";

function countLabel(count: number | null, coverage: DashboardRead["coverage"]["state"]) {
  if (count === null) return "unknown";
  return coverage === "complete" ? String(count) : `≥${count}`;
}

function dashboardChartOptions(model: DashboardRead): DashboardChartOptions {
  const { window, projects, visual, coverage } = model;
  const { git, hubnot } = visual.sources;
  const note = model.state === "empty" ? "No qualifying project activity yet."
    : model.state === "quiet" ? "No project activity in this window."
      : coverage.state !== "complete" ? "History incomplete. Shown counts are lower bounds where marked." : "";
  const windowLabel = `${window.start} – ${window.end} (UTC)`;
  const title = {
    text: visual.title,
    subtext: note ? `${windowLabel}\n${note}` : windowLabel,
    left: 15,
    top: 10,
    itemGap: 5,
    textStyle: { color: text, fontSize: 18 },
    subtextStyle: { color: muted, lineHeight: 16 },
  };

  if (!projects.length) return { animation: false, backgroundColor: "#161b22", title };
  return {
    animation: false,
    backgroundColor: "#161b22",
    title,
    legend: {
      data: [git.label, hubnot.label], left: 14, top: 83,
      textStyle: { color: muted },
    },
    grid: { left: 235, right: 226, top: 114, bottom: 35 },
    xAxis: {
      type: "value", min: 0, max: visual.maxCount || 1, minInterval: 1, show: visual.maxCount > 0,
      splitLine: { lineStyle: { color: border } },
      axisLabel: { color: muted },
    },
    yAxis: [
      {
        type: "category", inverse: true, data: projects.map(({ name }) => name),
        axisLine: { lineStyle: { color: border } }, axisTick: { show: false },
        axisLabel: { color: text, width: 205, overflow: "truncate", interval: 0 },
      },
      {
        type: "category", inverse: true, position: "right",
        data: projects.map((row) =>
          `${countLabel(row.gitCount, row.coverage.git)} Git · ${countLabel(row.hubnotCount, row.coverage.hubnot)} Hubnot`),
        axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: muted, interval: 0 },
      },
    ],
    series: [
      {
        type: "bar", stack: "observed", name: git.label, barMaxWidth: 13,
        itemStyle: { color: git.color }, data: projects.map(({ gitCount }) => gitCount ?? 0),
      },
      {
        type: "bar", stack: "observed", name: hubnot.label, barMaxWidth: 13,
        itemStyle: { color: hubnot.color }, data: projects.map(({ hubnotCount }) => hubnotCount ?? 0),
      },
    ],
  };
}

export function renderDashboardSvg(model: DashboardRead): string {
  const chart = initActivityChart(null, undefined, {
    renderer: "svg", ssr: true, width: 920,
    height: model.projects.length ? 156 + model.projects.length * 28 : 104,
  });
  try {
    chart.setOption(dashboardChartOptions(model));
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

export function renderDashboardPng(model: DashboardRead): Promise<Buffer> {
  return sharp(Buffer.from(renderDashboardSvg(model))).png().toBuffer();
}
