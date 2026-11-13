import { NextResponse } from "next/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({
    ok: false,
    error: { message: "Prepare and submit pipeline changes from repository Settings." },
    href: `/p/${encodeURIComponent(id)}/settings#pipeline-draft`,
  }, { status: 410 });
}
