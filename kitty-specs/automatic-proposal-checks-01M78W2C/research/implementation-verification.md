# Automatic proposal checks verification

Native companion: Hubnot `46332f2d` on `codex/automatic-proposal-checks`.
Reviewed Workbox lane: `28d7b7f`.

The production Next.js build, TypeScript check and nine focused tests passed. Coverage includes canonical validation, historical exclusion, observation replay, native signed pinned-definition execution, browser and MCP draft review and signing, a Chrome proposal open, a CLI proposal and revision from a synced clone, Go test and Go build in Bubblewrap, and activation of a trigger edit after native review, acceptance and merge. The clone recovered signed evidence without a local scheduling ledger.

The first broad Go run began while the native files were changing. Its child build encountered a transient compile error and the run timed out. Treat the focused native and integrated tests as the evidence for this implementation. Full operating system qualification remains a release activity.

The automatic runner is opt-in and initially supports Linux Bubblewrap. An enabled Hubnot contribution admission profile reports waiting under the existing native runner boundary. Live scheduling state belongs to one designated clone. Explicit attempt retry is not exposed in this version.

Hubnot provenance follow-up at `87302b59` adds the signed target ref and validates the source on canonical first-parent history. The native regression rejects a side commit even after its branch is merged. Seven paired tests passed against the corrected binary, including Chrome, MCP, and synced-clone evidence.
