import MarkdownIt from "markdown-it";

export function isVisualLinkAllowed(url: string) {
  const target = url.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(target)?.[1].toLowerCase();
  return !target.startsWith("//") && !/[\\\s]/u.test(target) &&
    Array.from(target).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) &&
    (!scheme || ["http", "https", "mailto"].includes(scheme));
}

const parser = new MarkdownIt({ html: true });
parser.validateLink = () => true;
export function supportsVisualMarkdown(source: string) {
  const tokens = parser.parse(source, {});
  const supported = (token: (typeof tokens)[number]): boolean => {
    if (token.type === "html_inline" || token.type === "html_block" || token.type === "image") return false;
    if (token.type === "link_open" && !isVisualLinkAllowed(token.attrGet("href") ?? "")) return false;
    return token.children?.every(supported) ?? true;
  };
  return tokens.every(supported);
}

