import { previewMarkdown } from "@/lib/workbox/markdown";

export async function POST(request: Request): Promise<Response> {
  const input: unknown = await request.json().catch(() => null);
  const result = previewMarkdown(input);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
