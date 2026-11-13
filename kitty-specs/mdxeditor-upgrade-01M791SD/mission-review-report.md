# MDXEditor post-merge review

Verdict: pass for the focused implementation scope. Full OS testing remains release qualification.

- FR-001 and FR-002: Visual defaults in all five composers; keyboard formatting and mode changes verified in Chrome. Source and Preview retain the original draft and switching does not change repository refs.
- FR-003 and FR-004: title and label changes preserve exact body bytes; lossy visual changes require source review before signing; unsupported content falls back to Source.
- FR-005: browser Preview, MCP stdio and published content match. Raw HTML and MDX remain inert and unsafe link targets are blocked.
- FR-006: stale drafts remain editable and retries preserve the reviewed payload and operation ID. Native proposal replay preserves the original commits and signed body even after the branch moves.

The merged application and test tree match reviewed commit `86b9027`. See [verification evidence](research/implementation-verification.md). The proposal composer needs a Hubnot binary supporting native exact publication, and proposals continue to require policy committed on the base branch.
