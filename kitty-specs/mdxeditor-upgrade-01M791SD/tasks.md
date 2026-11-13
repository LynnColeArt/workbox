# MDXEditor upgrade work packages

Target branch `codex/mdxeditor-upgrade`.

Use the [specification](spec.md) and [plan](plan.md).

## Work Package WP01 — Client-only Visual editor (Priority: P1)

- **Prompt** [WP01-visual.md](tasks/WP01-visual.md)
- **Dependencies**: None

T001 Pin MDXEditor and verify its initialization, user change, programmatic replacement, and error callbacks in the production Next build. (WP01)
T002 Implement the client-only Visual surface with keyboard controls for headings, emphasis, links, lists, quotes, tables, and fenced code. Validate pasted links and keep HTML and executable MDX inert. (WP01)

## Work Package WP02 — Exact source across Visual, Source and Preview (Priority: P1)

- **Prompt** [WP02-modes.md](tasks/WP02-modes.md)
- **Dependencies**: WP01

T003 Start supported drafts in Visual. Keep the form-owned source authoritative through mode switches, initialization, stale callbacks, and programmatic replacement. Preserve focus, disabled state, and raw source editing. (WP02)
T004 Distinguish deliberate visual edits from import normalization. Require explicit source review before publishing a candidate with unrelated changes. Fall back to Source on unsupported or unsafe imports with original bytes intact. (WP02)
T005 Retain the current Preview path and ignore stale preview responses. Verify no-op switching with mixed line endings, Unicode, whitespace, code fences, and absent final newline. (WP02)

## Work Package WP03 — Integrate composition and signed submission (Priority: P1)

- **Prompt** [WP03-forms.md](tasks/WP03-forms.md)
- **Dependencies**: WP02

T006 Wire issue descriptions and comments, discussion posts and replies, and the existing proposal description composer to the shared editor. Keep branch selection outside this package. (WP03)
T007 Trace proposal description bytes into the native event. Remove trimming and verify the native exact publication and replay contract before selecting the existing submission seam. (WP03)
T008 Verify unrelated title and label changes preserve the body, stale edits retain drafts, and uncertain submissions reuse the exact reviewed payload and operation ID. If Hubnot support is missing, record the native dependency and verify it before accepting the affected flow. (WP03)

## Work Package WP04 — Production browser and MCP preview parity (Priority: P1)

- **Prompt** [WP04-parity.md](tasks/WP04-parity.md)
- **Dependencies**: WP03

T009 Compare production browser Preview, MCP preview and published rendering for identical input, including code, tables, Unicode, raw HTML, unsafe links, and inert MDX. (WP04)
T010 Run keyboard and focus checks in the browser and complete exact-source mode switching, Source fallback, source review before signing, stale drafts, and lost-response replay. Verify mode switches leave Git refs unchanged. (WP04)
T011 Record the production build, focused regression tests and acceptance evidence. Reserve full OS testing for release qualification. (WP04)
