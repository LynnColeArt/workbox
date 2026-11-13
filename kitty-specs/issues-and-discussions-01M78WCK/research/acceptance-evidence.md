# Issues and Discussions acceptance evidence

The integrated execution lane passed the production Next.js build, TypeScript checks, lint on changed TypeScript files, and all 107 Node tests with the browser and MCP parity suites enabled. The fixture used the installed Hubnot binary and disposable Git repositories and SQLite indexes.

- Production HTTP and stdio MCP exercised complete issue writes, stable legacy links and tools, synced issue conflicts, exact Markdown source and preview, duplicate suppression, stale writes, and resolution.
- Production HTTP and MCP returned the same Hubnot contribution-policy denial for issues and discussions. The denied operations left Git refs unchanged. Discussion tests also exercised contextual replies, accepted-answer selection, and editing a reply while the answer stayed pinned to the accepted revision.
- A governed fixture reproduced concurrent native admission lock contention. Bounded retries now handle that diagnostic, and the same production fixture passes.
- Headless Chrome exercised keyboard Markdown formatting and focus, issue creation and editing, lost-response comment recovery, close and reopen, historical revisions, and preservation of a draft across a concurrent paginated edit.
- Headless Chrome exercised discussion creation, Markdown preview, replying, accepting and editing an answer, close and reopen, and stale draft review before resubmission.
- Native and shared-service tests recovered a signed operation without a duplicate after a lost response or index failure. Signed issue comments use Hubnot's append-only comment contract.

Spec Kitty's pre-review test discovery did not provide coverage for this project's Node test layout. The checks above supplied verification for review. Full OS testing is part of release qualification.
