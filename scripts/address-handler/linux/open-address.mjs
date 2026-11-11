import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

export function configDirectory() {
  const configured = process.env.XDG_CONFIG_HOME;
  const home = configured && isAbsolute(configured) ? configured : join(homedir(), ".config");
  return join(home, "workbox");
}

export function validateOrigin(value) {
  // Check the raw spelling before URL parsing can normalize a different host
  // or a path containing dot segments. Permit an optional root slash.
  const match = /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]+))?\/?$/.exec(value);
  if (!match || match[0] !== value || (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535))) {
    throw new Error("Configure Workbox with an HTTP(S) loopback origin, such as http://127.0.0.1:4123.");
  }
  return new URL(value).origin;
}

async function openAddress(args) {
  if (args.length !== 1 || !args[0].startsWith("workbox://") || /[\x00-\x1f\x7f]/u.test(args[0])) {
    throw new Error("Open a single workbox:// address, or paste it into Open address in Workbox.");
  }

  let origin;
  try {
    origin = validateOrigin(readFileSync(join(configDirectory(), "address-handler-origin"), "utf8").trim());
  } catch {
    throw new Error("Configure the local Workbox origin by rerunning the Linux address handler installer.");
  }

  const probe = new URL("/api/address-handler", origin);
  const request = probe.protocol === "https:" ? httpsRequest : httpRequest;
  const ready = await new Promise((resolve) => {
    // A one-use agent bypasses any proxy configured on the global agent.
    const pending = request(probe, {
      method: "HEAD",
      agent: false,
      signal: AbortSignal.timeout(2000),
    }, (response) => {
      response.resume();
      resolve(response.statusCode === 204 && response.headers["workbox-address-handler"] === "1");
    });
    pending.once("error", () => resolve(false));
    pending.end();
  });
  if (!ready) {
    throw new Error(`Workbox is unavailable at ${origin}. Start it there or rerun the installer with the correct origin.`);
  }

  const handoff = new URL("/open", origin);
  handoff.searchParams.set("address", args[0]);
  await new Promise((resolve, reject) => {
    const opener = spawn("xdg-open", [handoff.href], { stdio: "ignore" });
    opener.once("error", reject);
    opener.once("exit", (code) => code === 0 ? resolve() : reject(new Error("xdg-open failed")));
  }).catch(() => {
    throw new Error(`Could not open the default browser. Open Workbox at ${origin} and paste the address into Open address.`);
  });
}

function reportError(message) {
  console.error(message);
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return;

  const options = { detached: true, stdio: "ignore" };
  const dialog = spawn("zenity", ["--error", "--title=Workbox", `--text=${message}`], options);
  dialog.once("error", () => {
    const notification = spawn("notify-send", ["Workbox", message], options);
    notification.on("error", () => {});
    notification.unref();
  });
  dialog.unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await openAddress(process.argv.slice(2));
  } catch (error) {
    reportError(error.message);
    process.exitCode = 1;
  }
}
