# Explore and repository Code with browser and MCP parity

- **Mission branch** `feat/explore-code-parity`
- **Created** 2026-11-11
- **Status** Draft for review

Developers can find active projects, browse a repository's files with their Git history, and follow activity back to the records behind it. An agent working with the same project access can do the same work through MCP, including viewing the charts and retrieving their data.

## Explore

- **FR-001** Explore lists all accessible indexed projects in numbered pages of 20. Recent activity is the default sort, with A–Z available. Apply case-insensitive name and slug search before pagination. Keep a deterministic tie-breaker and preserve search and sort across page links. Changing search, sort, or the selected chart day resets the list to page one. Show the matching total and a useful empty state.
- **FR-002** At the top of Explore, a line chart shows the distinct projects active on each of the last seven calendar days, including today. A project contributes at most once per day, whether it has a qualifying Git commit, a verified Hubnot event, or both. Reuse the dashboard's eligibility rules for Git and Hubnot activity, including exclusion of Git commits reachable only through Hubnot storage refs. Use UTC day boundaries for the first pass and label them on both surfaces. Search narrows the chart population. Sort, page number, and the selected day affect the list without changing the chart's seven-day window.
- **FR-003** Selecting a chart day shows the matching projects, with the same 20-project pagination and a way to clear the day filter. Each result identifies the available activity sources behind its inclusion and links to the project. The daily count reconciles with the total number of projects in the drill-down for that day and search.

## Repository Code

- **FR-004** Start on the configured default branch, using `main` when no default is configured and `main` exists. If neither is available, choose an available revision and label it. Honor an explicit branch selection and preserve it while navigating directories and files. Read the tree and row metadata from the same resolved commit so a moving branch cannot mix revisions within a result.
- **FR-005** Use a familiar repository table with file and folder icons, the path name, the most recent commit summary affecting the entry, and its last-changed date. A directory reflects changes within that directory. Keep full commit ID, author name, and exact timestamp available when inspecting a row or following its commit link. For a file, surface its introduction date in file details when history establishes it, and indicate when rename history or missing objects prevent a reliable answer. Label unavailable metadata and keep the tree browsable. Git is authoritative for file trees, commits, dates, and diffs.
- **FR-006** Place an activity calendar near the top of the repository Code overview. Show the last year by day and default to **Commits** reachable from the repository's default branch. The other metrics are **Issue activity**, **Proposal activity**, and **CI results**, derived from verified Hubnot events. Each metric has its own counts, legend, and units. Switching the branch in the Code browser leaves the chart's repository and default-branch scope explicit. Switching the metric updates the calendar and clears the selected day.
- **FR-007** Selecting a calendar day lists the commits or verified events counted for that metric, with enough information to open the underlying commit, changed files, or Hubnot record. Paginate detail results when needed. For unavailable or incomplete history, distinguish unknown or partial counts from a known day with zero activity. Hubnot is authoritative for signed events and their visibility.

## Browser and MCP parity

- **FR-008** For the same project access and selected revision or activity snapshot, browser and MCP give access to the same catalog results, file and directory rows, commit details, chart metrics, date ranges, available filters, and drill-down records. A capability available from either chart is an acceptance obligation for MCP. Include applied filters, counts, units, time zone, scope, and completeness in the results. A tool client can paginate and drill down without parsing a web page.
- **FR-009** MCP provides both a viewable chart and its exact underlying series for Explore and Code. The visual uses the same labeled axes or dates, legend, metric, and selection as the browser. Results include stable record identifiers and a browser link that restores the supported filter or drill-down state. An MCP client can retrieve the chart and follow its data without depending on a remote chart service.
- **NFR-001** A keyboard user can change filters, select a date and page, and reach the underlying records. Counts, selection, and missing data remain understandable without color or pointer hover. The chart's data has a readable equivalent in the browser.
- **NFR-002** Browser and MCP apply the same visibility rules. Hidden projects, events, and paths do not appear in counts, charts, drill-downs, or error details. Local checkout paths and raw native diagnostics stay out of public results.

## Acceptance scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC-01 | Browse 43 accessible projects in both interfaces, then change sort and search. | Three pages of 20, 20, and 3 before filtering. Browser and MCP agree on order, membership, matching total, and normalized filters. Page links retain filters. |
| AC-02 | A project has two qualifying commits and a verified Hubnot event on one day. A second has only an unverified event. An earlier day has no activity. | The first project counts once. The second contributes nothing. Both interfaces expose the same seven labeled counts and visual. Selecting a date shows exactly the projects behind its point, including when drill-down spans pages. |
| AC-03 | Browse nested files and folders on two branches with different latest changes. Move the selected branch during a read. | Both interfaces return the same names, row metadata, full commit IDs, and dates for the resolved commit. Following a row opens the relevant commit or file details. Missing history yields an explicit unavailable state. |
| AC-04 | Switch the calendar through all four metrics, select a day, and follow one result for each metric. | Both interfaces show matching dates, legends, totals, series, and drill-down records. Commit results lead to changed files. Hubnot results lead to the signed record or its containing view. The browser link restores the metric and date. |
| AC-05 | Compare results for restricted access, an unavailable Git history, and a known empty day. | Browser and MCP expose matching authorized results and distinguish incomplete history from a known zero. No restricted data contributes to either visual. |
| AC-06 | Use the browser with keyboard only and an MCP client that reads chart data and the chart visual. | Both can discover filters, select a date, and reach the records behind the chart. An MCP client can verify the count directly from the returned data. |

## Scope and open decisions

- This pass covers Explore and repository Code, including the chart drill-downs needed by those two screens. The full branch activity graph under Insights, Dashboard form and sidebar changes, and workflow, extension, and migration administration are separate work.
- Keep familiar Workbox navigation and visual styling. The plan should confirm the proposed open-source UI primitives, icons, and chart library against the current stack and local distribution requirements.
- The existing Recently Active branch contains activity and Explore work. The plan must identify the integration base and reuse compatible eligibility logic. This spec is based on current `main`.
- The plan should select the MCP chart representation and resource shape, resolve how event kinds map to the calendar metrics, and define how both surfaces identify a comparable snapshot when data changes.
