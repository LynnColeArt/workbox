# Issues and Discussions work packages

Target branch `codex/issues-and-discussions`.

Use the [specification](spec.md) and [implementation plan](plan.md). Guided proposal creation and commit and proposal diffs are follow-up work.

## Work Package WP01 — Verify Hubnot collaboration contracts (Priority: P1)

- **Prompt** [WP01-native-contract.md](tasks/WP01-native-contract.md)
- **Dependencies**: None

T001 Inventory native issue and discussion reads, actor permissions, supported mutations, expected heads, and operation replay across installed and supported Hubnot versions. Identify any native changes required by the spec and establish their delivery dependency. (WP01)
T002 Exercise legacy, synced, signed, stale, denied, and competing-head fixtures. Confirm thread and reply identity, exact accepted answer revisions, and how to recover a signed outcome after a lost response. (WP01)

## Work Package WP02 — Shared permissions and signed action service (Priority: P1)

- **Prompt** [WP02-shared-service.md](tasks/WP02-shared-service.md)
- **Dependencies**: WP01

T003 Define common validated inputs and typed outcomes for HTTP and MCP, including resource IDs, cursors, expected revisions, operation IDs, actor choices, and available actions. (WP02)
T004 Resolve usable actors from caller context. Show equivalent availability reasons on both surfaces and require native authorization on every write. Preserve existing issue tools through compatibility adapters. (WP02)
T005 Bind retries to the original operation and resolve signed outcomes through Hubnot. Refresh the index independently and return canonical IDs, revisions, and indexing state. (WP02)

## Work Package WP03 — Rich Markdown editor, preview and rendering (Priority: P1)

- **Prompt** [WP03-markdown.md](tasks/WP03-markdown.md)
- **Dependencies**: None

T006 Build a reusable keyboard-accessible Write and Preview composer with source editing and controls for headings, emphasis, links, lists, quotes and fenced code. (WP03)
T007 Share rendering rules across preview, published views and MCP preview. Disable raw HTML execution, enforce safe link schemes, and preserve source bytes, including syntax outside the toolbar. (WP03)
T008 Provide draft retention hooks for failed submissions and resource-specific editor integration. Keep the component reusable for the later proposal form. (WP03)

## Work Package WP04 — Complete browser and MCP issue management (Priority: P1)

- **Prompt** [WP04-issues.md](tasks/WP04-issues.md)
- **Dependencies**: WP02, WP03

T009 Deliver paginated open and closed issue lists with title, number and label filtering. Keep stable numbers and existing deep links. Render issue body and conversation using the shared Markdown renderer. (WP04)
T010 Wire create, comment, title and description edits, label changes, close and reopen through the shared service and both transports. Show the acting identity and land on the signed issue after creation. (WP04)
T011 Expose native revisions and authorized conflict resolution. Preserve draft text when permissions, validation or stale revisions interrupt a write. (WP04)

## Work Package WP05 — Discussion discovery, thread creation and replies (Priority: P1)

- **Prompt** [WP05-discussion-threads.md](tasks/WP05-discussion-threads.md)
- **Dependencies**: WP02, WP03

T012 Replace the event feed with a paginated category and status list and stable thread detail. Render synced posts, replies and the accepted answer using verified native reads and bounded pagination. (WP05)
T013 Wire categorized thread creation and top-level or contextual replies to both transports using the shared composer and signed action service. Keep the reply target visible before and after posting. (WP05)
T014 Keep reply root IDs distinct from revisions and handle missing history and stale pagination with actionable states. (WP05)

## Work Package WP06 — Discussion editing, moderation and conflict resolution (Priority: P1)

- **Prompt** [WP06-discussion-management.md](tasks/WP06-discussion-management.md)
- **Dependencies**: WP05

T015 Add permitted post and reply edits, category changes, close and reopen, and marking and clearing an accepted answer in browser and MCP. (WP06)
T016 Pin answers to the exact reviewed reply revision. Handle stale thread or reply edits and authorized conflict resolution without losing draft text. (WP06)

## Work Package WP07 — End-to-end collaboration and parity verification (Priority: P1)

- **Prompt** [WP07-acceptance.md](tasks/WP07-acceptance.md)
- **Dependencies**: WP04, WP06

T017 Run complete issue and discussion journeys from list to signed outcome in the browser and through MCP. Compare actions, identity, permissions, filters, pagination, Markdown and resulting state. (WP07)
T018 Exercise old issue links and MCP tools, synced content, denial, stale and competing revisions, lost responses, and indexing recovery. Verify keyboard composition, focus and draft retention in the browser. (WP07)
T019 Record focused checks and repository validation. Reserve full OS testing for release qualification. (WP07)
