#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node --input-type=module - "$script_dir" "$@" <<'NODE'
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const [source, action, origin, ...extra] = process.argv.slice(2);
const { configDirectory, validateOrigin } = await import(pathToFileURL(join(source, "open-address.mjs")));
const dataHome = process.env.XDG_DATA_HOME;
const data = dataHome && isAbsolute(dataHome) ? dataHome : join(homedir(), ".local/share");
const settings = join(configDirectory(), "address-handler-origin");
const associations = join(dirname(configDirectory()), "mimeapps.list");
const id = "workbox-address.desktop";
const scheme = "x-scheme-handler/workbox=";
const entry = join(data, "applications", id);
const opener = join(data, "workbox", "address-handler", "open-address.mjs");

function setAssociation(enable) {
  const original = existsSync(associations) ? readFileSync(associations, "utf8") : "";
  const lines = original.split("\n");
  const group = lines.findIndex((line) => line.trim() === "[Default Applications]");
  if (group === -1) {
    if (!enable) return;
    lines.push("[Default Applications]", `${scheme}${id};`, "");
  } else {
    const next = lines.findIndex((line, i) => i > group && /^\s*\[/.test(line));
    const end = next === -1 ? lines.length : next;
    const index = lines.findIndex((line, i) => i > group && i < end && line.startsWith(scheme));
    if (index === -1) {
      if (!enable) return;
      lines.splice(group + 1, 0, `${scheme}${id};`);
    } else {
      const ids = lines[index].slice(scheme.length).trim().split(";").filter(Boolean);
      if (!enable && !ids.includes(id)) return;
      const others = ids.filter((value) => value !== id);
      const updated = enable ? [id, ...others] : others;
      if (updated.length) lines[index] = `${scheme}${updated.join(";")};`;
      else lines.splice(index, 1);
    }
  }
  const updated = lines.join("\n");
  if (updated === original) return;
  const pending = `${associations}.workbox-${process.pid}`;
  writeFileSync(pending, updated, { flag: "wx", mode: 0o600 });
  try {
    renameSync(pending, associations);
  } finally {
    rmSync(pending, { force: true });
  }
}

function desktopArgument(value) {
  if (/[\x00-\x1f\x7f]/u.test(value)) throw new Error("The install path contains an unsupported character.");
  const quoted = value.replace(/["`$\\]/g, "\\$&").replaceAll("\\", "\\\\").replaceAll("%", "%%");
  return `"${quoted}"`;
}

try {
  if (action === "uninstall" && origin === undefined) {
    setAssociation(false);
    for (const path of [entry, opener, settings]) rmSync(path, { force: true });
    console.log("Removed the Workbox address handler.");
  } else if (action === "install" && origin && extra.length === 0) {
    const value = validateOrigin(origin);
    const executable = realpathSync(process.execPath);
    if (executable.includes("=")) throw new Error("The Node executable path may not contain =.");
    const command = [executable, opener].map(desktopArgument).join(" ");
    const template = readFileSync(join(source, id), "utf8");
    for (const path of [entry, opener, settings]) mkdirSync(dirname(path), { recursive: true });
    copyFileSync(join(source, "open-address.mjs"), opener);
    writeFileSync(settings, `${value}\n`, { mode: 0o600 });
    writeFileSync(entry, template.replace("@WORKBOX_COMMAND@", () => command));
    setAssociation(true);
    console.log(`Enabled workbox:// links for ${value}.`);
  } else {
    throw new Error("Usage: install.sh install <local Workbox origin> | install.sh uninstall");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
NODE
