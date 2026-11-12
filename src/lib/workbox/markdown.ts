import MarkdownIt from "markdown-it";
import { z } from "zod";

const markdown = new MarkdownIt({ html: false });
const allowedSchemes = new Set(["http", "https", "mailto"]);

markdown.validateLink = (url) => {
  const target = url.trim();
  // A browser can interpret backslashes and control characters differently from
  // the Markdown parser. Keep relative references local and allow explicit schemes.
  if (target.startsWith("//") || /[\\\s]/u.test(target)) return false;
  for (const char of target) {
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(target)?.[1].toLowerCase();
  return scheme === undefined || allowedSchemes.has(scheme);
};

export function renderMarkdown(source: string): string {
  return markdown.render(source);
}

const previewInput = z.strictObject({ source: z.string().max(1_048_576) });

export function previewMarkdown(input: unknown) {
  const parsed = previewInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Provide Markdown source of up to 1,048,576 characters." },
    } as const;
  }
  const { source } = parsed.data;
  return { ok: true, data: { source, html: renderMarkdown(source) } } as const;
}
