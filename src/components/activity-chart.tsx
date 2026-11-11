"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { EChartsType } from "echarts/core";
import type { ActivityBucket, ActivityChartModel } from "../lib/workbox/activity-chart";

function localHref(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const base = "http://workbox.invalid";
    const url = new URL(value, base);
    if (url.origin === base && !url.pathname.startsWith("//")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return null;
  }
  return null;
}

function bucketLabel(bucket: ActivityBucket, unit: string) {
  if (bucket.count === null) return `${bucket.day} · Unknown`;
  return `${bucket.day} · ${bucket.partial ? "At least " : ""}${bucket.count} ${unit}`;
}

export function ActivityChart({ model }: { model: ActivityChartModel }) {
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    let disposed = false;
    let chart: EChartsType | undefined;
    let observer: ResizeObserver | undefined;
    void import("../lib/workbox/activity-chart-options").then(({ buildActivityChartOptions, initActivityChart }) => {
      if (disposed) return;
      chart = initActivityChart(element, undefined, { renderer: "svg" });
      chart.setOption(buildActivityChartOptions(model));
      chart.on("click", (event) => {
        const value = event as { componentType?: string; value?: unknown; dataIndex?: number };
        const day = value.componentType === "xAxis"
          ? model.buckets.find((bucket) => bucket.day === value.value)
          : value.componentType === "series" && typeof value.dataIndex === "number"
            ? model.buckets[value.dataIndex]
            : undefined;
        const href = day && localHref(day.href);
        if (href) router.push(href);
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(element);
    }).catch(() => {
      chart?.dispose();
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [model, router]);

  return (
    <figure className="wb-panel min-w-0 overflow-hidden p-2" aria-label={model.title}>
      <div className="overflow-x-auto" aria-hidden="true">
        <div ref={container} className={model.kind === "calendar" ? "h-[228px] min-w-[700px]" : "h-[250px] min-w-[360px]"} />
      </div>
      <details className="px-2 pb-2">
        <summary className="w-fit cursor-pointer text-sm wb-muted">
          {model.title} data by date ({model.timezone})
        </summary>
        <ul className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-1 text-sm">
          {model.buckets.map((bucket) => {
            const href = localHref(bucket.href);
            const label = bucketLabel(bucket, model.unit);
            return (
              <li key={bucket.day}>
                {href ? (
                  <a
                    className="wb-link block rounded px-2 py-1 aria-[current=date]:bg-[var(--wb-panel-2)] aria-[current=date]:font-semibold"
                    href={href}
                    aria-current={model.selectedDay === bucket.day ? "date" : undefined}
                  >
                    {label}
                  </a>
                ) : label}
              </li>
            );
          })}
        </ul>
      </details>
    </figure>
  );
}
