# Acceptance guide — Proposal detail and next actions

1. Create a disposable Hubnot repository and Workbox projection with a proposal root, a revision, and two sibling candidates. Record a review, run request/result, and decision on one candidate. Include a custom pipeline name, a review deficit, and a late predecessor review.
2. Open Proposals and follow a lineage entry. Verify the chooser appears for live siblings. Open each candidate directly and compare the header, evidence, and Checks against `hn proposal status FULL_ID --json`.
3. Exercise qualified and unqualified evidence, accepted-but-no-longer-ready, superseded, merged, protected-check, and unavailable-status fixtures. Verify next-step wording identifies the relevant role or missing prerequisite and never promises a merge.
4. Move the development branch after creating a candidate. Verify **Files changed** still compares its signed base and head. Use a fixture with missing objects and confirm the view reports the limitation without replacing the revisions or blocking other views.
5. Submit a review in a disposable repo and verify the receipt or event names the selected full candidate. Confirm the page refreshes that candidate. Exercise a refusal and confirm no false success is shown.
6. Verify keyboard navigation, scoped ESLint, TypeScript, the production build, and the proposal-focused tests. Use focused browser checks for this change. Save the full OS matrix for release qualification.
