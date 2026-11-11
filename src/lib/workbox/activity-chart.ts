import { createHash } from "node:crypto";

export type ActivityBucket = {
  day: string;
  count: number | null;
  href: string;
  partial?: boolean;
};

export type ActivityChartModel = {
  kind: "line" | "calendar";
  title: string;
  unit: string;
  timezone: "UTC";
  startDay: string;
  endDay: string;
  selectedDay: string | null;
  buckets: ActivityBucket[];
};

export function utcDayRange(days: number, now = new Date()): string[] {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - days + 1);
  return Array.from({ length: days }, () => {
    const value = day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
    return value;
  });
}

export function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(value);
  return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value ? null : value;
}

export function parsePage(value: unknown): number {
  const page = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof page === "number" && Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function activitySnapshot(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}
