import { connection } from "next/server";
import { runSettingsOperation } from "@/lib/workbox/settings-operations";

export const instant = false;

type Context = { params: Promise<{ id: string }> };

function response(result: Awaited<ReturnType<typeof runSettingsOperation>>) {
  if (result.ok) return Response.json(result);
  const status = new Map([
    ["invalid_input", 400], ["denied", 403], ["not_found", 404],
    ["stale_preview", 409], ["unchanged", 409], ["unsupported", 501], ["unavailable", 503],
  ]).get(result.error.code) ?? 400;
  return Response.json(result, { status });
}

function localOperator(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || !host || (fetchSite !== null && fetchSite !== "same-origin")) return false;
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      (url.protocol === "http:" || url.protocol === "https:") && url.origin === origin && url.host === host;
  } catch {
    return false;
  }
}

export async function GET(_request: Request, { params }: Context) {
  await connection();
  return response(await runSettingsOperation((await params).id, { action: "read" }, false));
}

export async function POST(request: Request, { params }: Context) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: { code: "invalid_input", message: "Expected a JSON request." } }, { status: 400 });
  }
  return response(await runSettingsOperation((await params).id, body, localOperator(request)));
}
