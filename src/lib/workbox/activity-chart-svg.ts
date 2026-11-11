import sharp from "sharp";
import type { ActivityChartModel } from "./activity-chart";
import { activityChartDimensions, buildActivityChartOptions, initActivityChart } from "./activity-chart-options";

export function renderActivityChartSvg(model: ActivityChartModel): string {
  const chart = initActivityChart(null, undefined, {
    renderer: "svg",
    ssr: true,
    ...activityChartDimensions(model.kind),
  });
  try {
    chart.setOption(buildActivityChartOptions(model));
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

export function renderActivityChartPng(model: ActivityChartModel): Promise<Buffer> {
  return sharp(Buffer.from(renderActivityChartSvg(model))).png().toBuffer();
}
