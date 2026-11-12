# Pipeline graph editor work packages

**Target branch** `feat/pipeline-graph-editor`

Use the [specification](spec.md) and [plan](plan.md). Package prompts record ownership and review evidence.

## Work Package WP01 — Pinned repository template catalog (Priority: P1)

- **Prompt** [WP01-repo-templates.md](tasks/WP01-repo-templates.md)
- **Dependencies**: None

T001 Read the regular UTF-8 catalog blob at the pinned Git commit. Return its source link, availability state, valid entries and path diagnostics within the planned limits. (WP01)
T002 Expand typed input references into one native step and validate the result. Prove that defaults, explicit empty values, and literal arguments survive without running commands or changing Git state. (WP01)

## Work Package WP02 — Shared Graph and JSON draft (Priority: P1)

- **Prompt** [WP02-shared-draft.md](tasks/WP02-shared-draft.md)
- **Dependencies**: WP01

T003 Open and refresh a client-owned draft at a pinned base. Define revision checks, ordered nodes and edges, draft-scoped identifiers, and diagnostics. (WP02)
T004 Apply add, template expansion, patch, duplicate, reorder, and remove operations through one reducer. Serialize deliberate graph edits deterministically and keep editor metadata outside the definition. (WP02)
T005 Preserve exact JSON text, distinguish graph-authored incomplete drafts from unprojectable manual edits, and implement explicit last-valid restoration. Revalidate client input and derive graph state from authoritative text. (WP02)

## Work Package WP03 — Exact diff and review binding (Priority: P1)

- **Prompt** [WP03-exact-review.md](tasks/WP03-exact-review.md)
- **Dependencies**: WP02

T006 Bind review to the exact pinned committed bytes, draft bytes and signer using the existing Settings preview. Detect stale base or signer and preserve the legacy preview contract. (WP03)
T007 Return deterministic diff hunks and exact before and after text, including absence, line endings, missing final newline, and formatting-only changes. Bound diff work and expose partial results explicitly. (WP03)
T008 Define the confirmed submission payload and retry contract around the existing Settings submit operation. Preserve the exact reviewed bytes and original operation ID after an uncertain response. (WP03)

## Work Package WP04 — Shared Settings HTTP and MCP operations (Priority: P1)

- **Prompt** [WP04-settings-transport.md](tasks/WP04-settings-transport.md)
- **Dependencies**: WP01, WP02, WP03

T009 Expose draft open and refresh, catalog read, typed edits and review through the shared Settings dispatcher, HTTP, and MCP. Validate the same public inputs and project the same results and errors. (WP04)
T010 Preserve existing Settings tool schemas and authorization. Use the existing explicit proposal submission operation and verify that exact drafts, diagnostics, links, and recovery outcomes pass through both transports. (WP04)

## Work Package WP05 — Settings Graph, JSON and Review tabs (Priority: P1)

- **Prompt** [WP05-graph-editor.md](tasks/WP05-graph-editor.md)
- **Dependencies**: WP04

T011 Build the ordered graph with connectors and a step inspector. Provide keyboard-operable tab, node, argument and reorder controls with predictable focus. (WP05)
T012 Wire template expansion and Graph and JSON operations to the shared draft. Preserve the exact source, show stale projection diagnostics, and ignore out-of-order responses. (WP05)
T013 Show the shared diff with exact text access and explicit confirmation. Freeze the submitted attempt so an uncertain result can retry independently of later draft edits or refreshes. (WP05)

## Work Package WP06 — Production parity and proposal recovery verification (Priority: P1)

- **Prompt** [WP06-parity-verification.md](tasks/WP06-parity-verification.md)
- **Dependencies**: WP04, WP05

T014 Run the same draft and template edits through production HTTP and MCP. Compare structured nodes, edges, JSON bytes, diagnostics, catalog revisions and exact diffs. (WP06)
T015 Submit through the existing native proposal capability and verify candidate bytes, signer, stale base, and retry after a lost response without a duplicate event. Verify older Hubnot capability fallback and keep fixtures disposable. (WP06)
T016 Record keyboard browser checks, focused and existing Settings regressions, lint, TypeScript, and production build evidence. Reserve full OS qualification for release. (WP06)
