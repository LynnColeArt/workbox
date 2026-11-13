export function requiresSourceReview(original: string, visualBaseline: string | undefined) {
  return original !== "" && visualBaseline !== original;
}
