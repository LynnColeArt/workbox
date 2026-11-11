# Mission Specification — Recently active projects

- **Mission branch** `feat/recently-active-projects`
- **Created** 2026-11-11
- **Status** Draft for review

A developer opening Workbox wants to see where work happened lately and reach any project without scrolling through the entire directory on the Dashboard. Git commits and verified Hubnot events both count as activity. A project can surface through either source.

## User Scenarios & Testing

### Story 1 — Resume work from the Dashboard (P1)

A developer opens the Dashboard, sees at most ten recently active projects beside the activity feed, and opens one directly.

1. Given twelve projects with distinct qualifying activity timestamps, opening the Dashboard shows exactly the ten newest in descending order. A Git-only project and a Hubnot-only project can both qualify.
2. Given a project with a recent unverified event and an older qualifying commit, the project ranks and labels its latest activity using the older commit.
3. Given fewer than ten projects with activity, the panel shows only those projects. If none qualify, it explains that there is no activity yet and still links to Explore.

### Story 2 — Find any project in Explore (P1)

A developer follows **View all projects** or the global **Explore** link to find a project outside the Dashboard’s top ten.

1. Given 188 indexed projects, Explore can reach all 188, including projects without qualifying activity. Recent activity is the default order, and projects without activity follow those with activity.
2. Given a project whose name matches the search text, searching in Explore returns that project regardless of activity. The developer can also switch to A–Z sorting.

### Story 3 — See the week’s activity at a glance (P2)

A developer sees a compact comparison chart below the Dashboard summary and above the activity feed.

1. Given projects with mixed Git and Hubnot activity, the chart shows the same projects in the same order as the Dashboard list, with separate labeled counts for the past seven days.
2. Given a commit reachable from two local branches, the chart counts it once for that project. An unverified Hubnot event is excluded.
3. Given a listed project whose latest activity is older than seven days, its chart counts are zero. If there are no qualifying projects, the chart area shows an empty state.

### Edge cases

- A missing or unreadable Git checkout does not hide the project from Explore. Its verified indexed Hubnot events can still qualify it for the Dashboard.
- Activity with a missing, invalid, or future timestamp does not affect ordering or chart counts.
- Equal latest-activity timestamps sort by project name and then project ID. If both sources have the same latest timestamp for one project, the row can show both signals.

## Requirements

### Functional requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-001 | Rank indexed projects by the most recent qualifying timestamp from Git commits reachable from local branches or verified indexed Hubnot events. Use Git committer time and Hubnot event time. | High | Open |
| FR-002 | Show at most ten qualifying projects on the Dashboard, with a project link and the source and time of the latest activity. Keep the existing activity feed visible. | High | Open |
| FR-003 | Link the Dashboard panel and global navigation to Explore. Explore makes every indexed project reachable, supports case-insensitive name search, and offers recent-activity and A–Z ordering. | High | Open |
| FR-004 | Show a chart near the top of the Dashboard for the same projects as the list. Show distinct Git commit and verified Hubnot event counts over the preceding seven days, with the period visible. | Medium | Open |
| FR-005 | Show clear empty states for the Dashboard list, chart, and Explore search. Use whichever activity source is available for a project. | High | Open |

### Non-functional requirements

| ID | Requirement | Category | Status |
|---|---|---|---|
| NFR-001 | At a 320 CSS-pixel viewport, the project list, chart, and Explore controls remain usable without page-level horizontal scrolling. | Usability | Open |
| NFR-002 | Every chart value is available as text. Users can identify each source and count without relying on color or hover. | Accessibility | Open |

### Constraints

| ID | Constraint | Category | Status |
|---|---|---|---|
| C-001 | Derive activity from existing local Git history and Workbox’s verified Hubnot projection. Dashboard and Explore browsing must work without fetching remotes or mutating repositories. | Data | Open |
| C-002 | Use the existing Workbox theme and navigation with zero new npm dependencies. | Product | Open |
| C-003 | Trending, per-file history, proposal workflow changes, and MCP changes are outside this mission. | Scope | Open |

### Key entities

- **Indexed project** — A Workbox project with a stable ID, a display name, and an optional description.
- **Project activity** — A timestamped Git commit or verified Hubnot event associated with an indexed project.
- **Chart counts** — Distinct commits and distinct verified events per project within the same rolling seven-day period.

## Success Criteria

- With 188 indexed projects and at least ten qualifying projects, the Dashboard displays exactly ten project rows and the full directory is one click away.
- In a fixture with both activity sources and tied timestamps, the Dashboard and Explore return the expected order on repeated loads with the same data.
- Chart membership matches the Dashboard list exactly. The source totals match the fixture, including duplicate branch reachability, unverified events, and events outside the window.
- Searching Explore finds a project that has no activity and is absent from the Dashboard.

## Assumptions

- The chart uses a rolling seven-day window as a draft product default. The list uses the latest available activity even when it falls outside that window.
- Local branches are the Git scope. Remote-only refs, tags, and Hubnot event-storage refs are outside Git commit counts.
- Chart rendering is a planning decision. Mermaid is optional if it can satisfy the dependency and accessibility constraints.
