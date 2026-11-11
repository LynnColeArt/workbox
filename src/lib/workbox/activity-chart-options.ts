import { HeatmapChart, LineChart } from "echarts/charts";
import {
  CalendarComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
} from "echarts/components";
import { init, use as registerChartComponents } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";
import type { HeatmapSeriesOption, LineSeriesOption } from "echarts/charts";
import type {
  CalendarComponentOption,
  GridComponentOption,
  TitleComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from "echarts/components";
import type { ActivityBucket, ActivityChartModel } from "./activity-chart";

registerChartComponents([
  CalendarComponent, GridComponent, HeatmapChart, LineChart, SVGRenderer,
  TitleComponent, TooltipComponent, VisualMapPiecewiseComponent,
]);

export { init as initActivityChart };

type ChartOptions = ComposeOption<
  CalendarComponentOption | GridComponentOption | HeatmapSeriesOption | LineSeriesOption
  | TitleComponentOption | TooltipComponentOption | VisualMapComponentOption
>;

const colors = {
  panel: "#161b22",
  text: "#e6edf3",
  muted: "#aab3bd",
  border: "#30363d",
  green: "#3fb950",
  unknown: "#59636e",
  partial: "#e3b341",
};

export function activityChartDimensions(kind: ActivityChartModel["kind"]) {
  return kind === "calendar" ? { width: 840, height: 228 } : { width: 740, height: 250 };
}

function describeBucket(bucket: ActivityBucket, unit: string) {
  if (bucket.count === null) return "Unknown";
  return `${bucket.partial ? "At least " : ""}${bucket.count} ${unit}`;
}

function activityTooltip(model: ActivityChartModel): TooltipComponentOption {
  return {
    trigger: "item",
    renderMode: "richText",
    confine: true,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    textStyle: { color: colors.text },
    formatter: (value) => {
      if (Array.isArray(value)) return "";
      const bucket = model.buckets[value.dataIndex];
      return bucket ? `${bucket.day} UTC\n${describeBucket(bucket, model.unit)}` : "";
    },
  };
}

function lineChart(model: ActivityChartModel): ChartOptions {
  return {
    grid: { left: 52, right: 24, top: 87, bottom: 32 },
    xAxis: {
      type: "category",
      boundaryGap: true,
      data: model.buckets.map(({ day }) => day),
      triggerEvent: true,
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        color: (day) => day === model.selectedDay ? colors.green : colors.muted,
        formatter: (day) => day.slice(5),
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      minInterval: 1,
      splitLine: { lineStyle: { color: colors.border } },
      axisLabel: { color: colors.muted },
    },
    series: [{
      type: "line",
      name: model.unit,
      connectNulls: false,
      symbol: "circle",
      showSymbol: true,
      lineStyle: { color: colors.green, width: 2 },
      data: model.buckets.map((bucket) => {
        const selected = bucket.day === model.selectedDay;
        return {
          value: bucket.count ?? "-",
          symbolSize: selected ? 11 : 7,
          itemStyle: {
            color: bucket.partial ? colors.partial : colors.green,
            borderColor: selected ? colors.text : colors.panel,
            borderWidth: selected ? 2 : 1,
          },
        };
      }),
    }],
  };
}

function calendarChart(model: ActivityChartModel): ChartOptions {
  return {
    calendar: {
      range: [model.startDay, model.endDay],
      top: 89,
      bottom: 38,
      left: 44,
      right: 17,
      cellSize: ["auto", 14],
      splitLine: { show: false },
      itemStyle: { color: colors.panel, borderColor: colors.panel, borderWidth: 0 },
      yearLabel: { show: false },
      monthLabel: { nameMap: "en", color: colors.muted, fontSize: 10 },
      dayLabel: {
        firstDay: 0,
        nameMap: ["", "Mon", "", "Wed", "", "Fri", ""],
        color: colors.muted,
        fontSize: 10,
      },
    },
    visualMap: {
      type: "piecewise",
      dimension: 1,
      orient: "horizontal",
      left: "center",
      bottom: 4,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      inverse: true,
      selectedMode: false,
      textStyle: { color: colors.muted, fontSize: 10 },
      pieces: [
        { value: -1, label: "Unknown", color: colors.unknown },
        { value: 0, label: "0", color: colors.border },
        { min: 1, max: 2, label: "1–2", color: "#185b35" },
        { min: 3, max: 5, label: "3–5", color: "#248147" },
        { min: 6, max: 10, label: "6–10", color: "#36a659" },
        { min: 11, label: "11+", color: "#68d984" },
      ],
    },
    series: [{
      type: "heatmap",
      coordinateSystem: "calendar",
      data: model.buckets.map((bucket) => {
        const selected = bucket.day === model.selectedDay;
        return {
          value: [bucket.day, bucket.count ?? -1],
          itemStyle: {
            borderColor: selected ? colors.text : bucket.partial ? colors.partial : colors.panel,
            borderWidth: selected || bucket.partial ? 2 : 1,
          },
        };
      }),
    }],
  };
}

export function buildActivityChartOptions(model: ActivityChartModel): ChartOptions {
  const selected = model.buckets.find((bucket) => bucket.day === model.selectedDay);
  const context = [`${model.unit} · ${model.startDay} – ${model.endDay} (${model.timezone})`];
  if (selected) context.push(`${selected.day} · ${describeBucket(selected, model.unit)}`);
  const hasUnknown = model.buckets.some((bucket) => bucket.count === null);
  const hasPartial = model.buckets.some((bucket) => bucket.partial && bucket.count !== null);
  const coverage = [
    hasUnknown && model.kind === "line" && "Gaps indicate unknown activity",
    hasPartial && "Amber indicates partial data",
  ].filter(Boolean);
  if (coverage.length) context.push(coverage.join(" · "));

  return {
    animation: false,
    backgroundColor: colors.panel,
    title: {
      text: model.title,
      subtext: context.join("\n"),
      itemGap: 4,
      left: 12,
      top: 6,
      textStyle: { color: colors.text, fontSize: 15 },
      subtextStyle: { color: colors.muted, fontSize: 11, lineHeight: 15 },
    },
    tooltip: activityTooltip(model),
    ...(model.kind === "calendar" ? calendarChart(model) : lineChart(model)),
  };
}
