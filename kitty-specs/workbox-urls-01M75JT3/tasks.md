# Work packages — Workbox addresses and deep links

- **Planning and merge target** `feat/workbox-urls`
- **Inputs** [Spec](spec.md), [plan](plan.md), [data model](data-model.md), [interfaces](contracts/address-interfaces.md), and [acceptance guide](quickstart.md)

## Dependency overview

```text
WP01 → WP02 → WP04 / WP05 / WP06 ─┐
  └──→ WP03 ────────────────────────┴→ WP07
```

WP02 and WP03 can proceed independently after WP01. The three platform adapters can proceed independently once the browser handoff and readiness route are available. WP07 consumes the integrated results. No implementation is started by this document.

## Work Package WP01 — Shared address parsing and lookup (Priority: P1)

- **Prompt** [WP01-address-resolution.md](tasks/WP01-address-resolution.md)
- **Dependencies**: None
- **Independent acceptance** Parser and fixture-backed lookup tests pass. No Next.js or MCP route changes.
- **Owned surfaces** `src/lib/workbox/address.ts`, `src/lib/workbox/address-resolution.ts`, `tests/workbox-address.test.ts`

T001 Parse and format Workbox addresses (WP01)
T002 Resolve project and issue identity (WP01)
T003 Verify canonical, alias, and invalid cases (WP01)

## Work Package WP02 — Browser address entry and readiness endpoint (Priority: P1)

- **Prompt** [WP02-browser-address-entry.md](tasks/WP02-browser-address-entry.md)
- **Dependencies**: WP01
- **Independent acceptance** A fresh fixture instance supports address entry without an installed handler and returns the documented readiness response.
- **Owned surfaces** `src/app/layout.tsx`, `src/app/open/page.tsx`, `src/app/api/address-handler/route.ts`, `tests/workbox-address-web.test.ts`

T004 Add the Open address page and navigation (WP02)
T005 Resolve pasted and handed-off addresses (WP02)
T006 Expose the handler readiness probe (WP02)
T007 Verify web entry and readiness (WP02)

## Work Package WP03 — MCP resource discovery and compatibility (Priority: P1)

- **Prompt** [WP03-mcp-resource-compatibility.md](tasks/WP03-mcp-resource-compatibility.md)
- **Dependencies**: WP01
- **Independent acceptance** An MCP client can discover canonical URLs and read the same resources with all saved legacy URLs.
- **Owned surfaces** `mcp/server.ts`, `tests/workbox-address-mcp.test.ts`

T008 Publish canonical MCP addresses (WP03)
T009 Preserve all four legacy reads (WP03)
T010 Apply resource redaction and controlled errors (WP03)
T011 Verify the real stdio protocol with fixtures (WP03)

## Work Package WP04 — Linux desktop protocol handler (Priority: P1)

- **Prompt** [WP04-linux-handler.md](tasks/WP04-linux-handler.md)
- **Dependencies**: WP02
- **Independent acceptance** A Linux release-candidate installation passes DL-001 on a supported desktop.
- **Owned surfaces** `scripts/address-handler/linux/open-address.mjs`, `scripts/address-handler/linux/install.sh`, `scripts/address-handler/linux/workbox-address.desktop`, `scripts/address-handler/linux/README.md`

T012 Implement the Linux opener (WP04)
T013 Package opt-in Linux registration (WP04)
T014 Exercise Linux and Firefox handoff (WP04)

## Work Package WP05 — macOS protocol handler (Priority: P1)

- **Prompt** [WP05-macos-handler.md](tasks/WP05-macos-handler.md)
- **Dependencies**: WP02
- **Independent acceptance** A signed macOS release-candidate bundle passes DL-002 and can be removed without affecting in-app entry.
- **Owned surfaces** `scripts/address-handler/macos/WorkboxAddressHandler.swift`, `scripts/address-handler/macos/Info.plist`, `scripts/address-handler/macos/build.sh`, `scripts/address-handler/macos/README.md`

T015 Build the AppKit URL receiver (WP05)
T016 Document and package opt-in registration (WP05)
T017 Exercise macOS and Safari handoff (WP05)

## Work Package WP06 — Windows protocol handler (Priority: P1)

- **Prompt** [WP06-windows-handler.md](tasks/WP06-windows-handler.md)
- **Dependencies**: WP02
- **Independent acceptance** The upcoming Windows release candidate passes DL-003. Linux or macOS evidence cannot substitute for this result.
- **Owned surfaces** `scripts/address-handler/windows/WorkboxAddressHandler.cpp`, `scripts/address-handler/windows/README.md`, `scripts/address-handler/windows/build.ps1`

T018 Implement native Windows activation and browser launch (WP06)
T019 Wire registration to the Windows release candidate (WP06)
T020 Exercise Windows and Edge handoff (WP06)

## Work Package WP07 — Release qualification and documentation (Priority: P1)

- **Prompt** [WP07-release-qualification.md](tasks/WP07-release-qualification.md)
- **Dependencies**: WP02, WP03, WP04, WP05, WP06
- **Independent acceptance** Release notes and support claims match recorded acceptance. No release publication is part of this package.
- **Owned surfaces** `docs/workbox-addresses.md`

T021 Publish one address and setup guide (WP07)
T022 Run cross-surface regressions on integrated artifacts (WP07)
T023 Collect release evidence per platform (WP07)
