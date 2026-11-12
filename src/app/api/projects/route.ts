import { NextResponse, connection } from "next/server";
import { createProject } from "@/lib/workbox/create";

export const instant = false;

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_input", message: "Enter a project ID and optional name and description." } }, { status: 400 });
  }
  const result = await createProject(body);
  const status = result.ok ? 200 : {
    invalid_input: 400,
    conflict: 409,
    initialization_failed: 500,
    indexing_failed: 503,
    recovery_required: 409,
  }[result.error.code];
  return NextResponse.json(result, { status });
}
