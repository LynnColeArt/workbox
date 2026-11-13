export function patchLines(text: string) {
  let before = 0;
  let after = 0;
  let inHunk = false;
  return text.replace(/\n$/, "").split("\n").map(line => {
    const hunk = /^@@ -([0-9]+)(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/.exec(line);
    if (hunk) {
      before = Number(hunk[1]);
      after = Number(hunk[2]);
      inHunk = true;
    }
    const marker = inHunk && !hunk ? line[0] : "";
    const oldLine = marker === "-" || marker === " " ? before++ : null;
    const newLine = marker === "+" || marker === " " ? after++ : null;
    return { line, oldLine, newLine, kind: hunk ? "hunk" : marker };
  });
}
