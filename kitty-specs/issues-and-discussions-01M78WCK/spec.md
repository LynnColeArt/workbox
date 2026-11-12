# Issues and Discussions in Workbox

- **Branch** `codex/issues-and-discussions`
- **Status** Draft
- **Scope** Complete the Issues and Discussions workflows before the proposal creation follow-up.

People can participate in and manage Issues and Discussions from Workbox without running terminal commands. Every supported browser action is available through MCP with the same inputs, permission checks, and outcomes.

## Issues

1. A contributor can browse open and closed issues, search by title or number, filter by label, and page through results. Opening a result shows its title, rendered description, labels, status, and conversation. Existing issue links and stable local numbers continue to resolve.
2. A contributor can open an issue and land on its detail page, then post a comment from that page. A permitted editor can change the title, description, or labels, and close or reopen the issue. The timeline shows who acted and when.
3. A maintainer encountering conflicting signed revisions can inspect the competing versions and resolve the conflict in the browser when Hubnot authorizes it. A stale edit preserves the draft, shows what changed, and allows review before resubmitting.

## Discussions

1. A contributor can browse discussion threads, filter by category and status, and page through results. Each result shows enough context to pick a thread. The thread page shows the original post, replies, and any accepted answer.
2. A contributor can start a discussion by choosing a category and composing a post. They can reply to the thread or to a specific reply, with the reply target visible while composing and after posting. A permitted editor can edit the original post or a reply.
3. A permitted maintainer or author can change a thread's category, close or reopen it, and mark or clear an accepted answer when Hubnot permits the action. The accepted answer identifies the exact reply revision, so later edits to a reply do not silently change the accepted content.
4. When competing signed revisions exist, authorized users can inspect and resolve them in Workbox. Existing synced discussions and replies appear as threads and conversation content.

## Rich Markdown composition

- Use a consistent editor for issue descriptions and comments, discussion posts and replies, and proposal descriptions. The editor supports formatting controls, keyboard access, raw Markdown editing, and a rendered preview. Cover headings, emphasis, links, lists, quotes, and fenced code. Titles, labels, and categories use their own fields.
- Compose and edit surfaces preserve the stored Markdown, including content outside the toolbar's formatting options. Preview and published views use the same rendering rules. Raw HTML and unsafe links cannot execute. Preserve draft text on validation, permission, or network errors.
- MCP reads and writes the same Markdown source and can obtain the rendered preview under the same rendering rules. An MCP-authored post opens in the browser editor with its formatting intact, and browser-authored Markdown is returned unchanged over MCP.
- Proposal descriptions get the same editor contract. The proposal creation follow-up applies it to that form.

## Identity, permissions, and parity

- Before a signed action, show the acting identity and allow selection where the instance supports multiple authorized identities. Show an actionable explanation when no usable identity is available. MCP reports the actor and accepts the same permitted actor choice.
- Hubnot remains the authority for author, maintainer, and other operation-specific permissions. Both interfaces use the same authorization rules and return equivalent outcomes. Editing a category or label grants no permissions.
- Use stable issue, thread, and reply identifiers, and preserve signed provenance. State-changing edits carry the version the user reviewed. Both surfaces report conflicts and validation errors without discarding entered content.
- A retry after an interrupted response must be able to recover the outcome without posting a duplicate comment or reply or creating a duplicate issue or thread. If signing succeeded and refresh is pending, report that distinction and recover visibility without asking the user to post again.
- Issue comment editing, deletion, and additional moderation actions depend on the native resource model. Planning must confirm which operations Hubnot supports and identify native changes for any required flow, without simulating signed changes in Workbox's index.
- Preserve compatibility for existing MCP issue tools and links. MCP parity covers listing, filters, pagination, detail, conversation, available actions, and mutations.

## Functional Requirements

- **FR-001** Browse and manage issues from creation through closure, with searchable, paginated lists and a signed conversation.
- **FR-002** Browse and manage discussion threads and replies, including categories, moderation and exact-revision accepted answers.
- **FR-003** Apply Hubnot permissions and identity consistently in the browser and MCP. Preserve user drafts on conflicts and recover signed writes on retry.
- **FR-004** Share rich Markdown composition, preview and safe rendering while retaining the original source.
- **FR-005** Provide browser and MCP parity for all supported actions while preserving existing links and tools.

## Acceptance

- A person can open, comment on, edit, label, close, and reopen an issue without leaving Workbox. An agent can complete the same sequence through MCP under the same identity and permissions.
- A person can start a categorized discussion, reply in context, edit a permitted post, accept or clear an answer, and close and reopen the thread. The same actions work over MCP, and synced content remains readable.
- Exercise both surfaces for permission denial, stale edits, conflicting revisions, interrupted writes, and Markdown round-trips. The displayed conversation and signed state agree after refresh.
- Run focused browser and MCP acceptance tests during implementation. Full OS testing belongs to release qualification.

## Follow-up after Issues and Discussions

The Proposals page currently asks users to type a head branch and assumes the base is `main`. A guided creation flow should use the repository's branch list and explain the two choices in context. The source branch contains the changes. The target branch is where the user wants those changes to land.

- Put a visible **New proposal** action on the list and in its empty state. Default the target to the repository's actual default branch. Use searchable branch dropdowns for source and for eligible targets. Explain how to make a branch visible to Workbox when there are no eligible choices.
- After branch selection, show the commits and changed files and the exact revisions being compared. Explain identical branches, branches with no changes, and comparisons Hubnot cannot open. If a branch moves after preview, refresh the comparison and ask the user to review the updated revision before signing.
- Let the user add a title and rich Markdown description, show which identity will sign, then open the new proposal's detail page. Explain the next available action based on the user's role and current policy. Reuse the existing review and check status where available.
- MCP exposes eligible branches, the same comparison and validation, explicit submission, and the resulting proposal link and next actions. A novice acceptance test starts at an empty proposal list and ends on the newly opened proposal with a clear next step.
