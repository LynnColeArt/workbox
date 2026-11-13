import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function workboxPageSize(): number {
  const path = process.env.WORKBOX_SETTINGS_PATH ?? resolve("workbox.settings.json");
  try {
    const { pageSize } = JSON.parse(readFileSync(path, "utf8"));
    if (pageSize === undefined) return 10;
    if (Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 50) return pageSize;
    throw new Error("invalid pageSize");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write("Workbox settings require an integer pageSize from 1 to 50. Using 10.\n");
    }
    return 10;
  }
}
