# Dashboard cleanup and project creation parity

- **Mission branch** `feat/dashboard-cleanup`
- **Created** 2026-11-11
- **Status** Draft for review

The dashboard gives developers a quick read on recent work and a clear place to start a project. Explore is the route to the full catalog. An agent with equivalent access can retrieve the dashboard snapshot and create a project through MCP.

## Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Remove the all-projects sidebar from the dashboard at every viewport size. Keep a visible link to the paginated Explore catalog, the dashboard activity feed, and the existing summary counts. |
| FR-002 | Preserve the dashboard's seven-day snapshot and its current ranking, visible project limit, Git and verified Hubnot counts, history coverage, and project links. Keep a readable empty state and an accessible equivalent for the visual. |
| FR-003 | Place a **New Hubnot project** button in the dashboard header. Activating it opens a modal with the existing project ID, display name, and description fields. The form appears in the modal and submits only on an explicit create action. Dismissing it before submission leaves the repository and index untouched. |
| FR-004 | Preserve the existing creation outcome, including the repository, initialized Hubnot identity and governance, founding signed issue, and indexing. Show a usable link to the project on success. Keep the entered values and give a controlled explanation on a validation or creation failure. Protect the existing project on a duplicate ID and avoid duplicate initialization on repeated or concurrent submissions. If initialization or indexing stops partway, report the outcome accurately and give an actionable recovery path. |
| FR-005 | Provide the dashboard reads over MCP for equivalent project access. The agent can retrieve the seven-day snapshot as a viewable visual and exact data, including the time window, ranking, counts by source, and links to the same projects and Explore. Expose the same summary and activity-feed information. Any dashboard selection or drill-down offered by the browser has an MCP equivalent. |
| FR-006 | Provide explicit project creation over MCP with the same inputs, defaults, validation, access rules, and outcomes as the browser. Both entry points use the same creation behavior and return the project identifier and browser destination on success. Failures reveal neither machine-local paths nor raw diagnostics or private identity data. |

## Acceptance scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AC-01 | Open the dashboard with more than 20 indexed projects at desktop and narrow widths. | The dashboard shows the existing seven-day snapshot, summary, and feed. The full catalog is reachable through Explore and does not render as a dashboard sidebar. |
| AC-02 | Open the modal from the header with the keyboard, navigate its fields, and dismiss it. | The dialog has an accessible name, receives focus, supports keyboard interaction, and returns focus to the trigger on dismissal. No project is created. |
| AC-03 | Submit equivalent valid requests from the browser and MCP against separate disposable instances. | Both initialize and index a project with matching public results and a working project link. The founding signed issue is discoverable in both. |
| AC-04 | Submit invalid input, a duplicate ID, and competing requests for the same ID across browser and MCP. | Both surfaces report the same outcome categories. An existing repository remains intact, only one initialization succeeds, and browser errors leave the form usable. A simulated partial failure cannot be reported as success. |
| AC-05 | Load the dashboard and MCP from the same fixture and reporting window, including a quiet instance and an instance with incomplete history. | The visual and exact data agree on displayed projects, order, counts, and destinations. Both surfaces distinguish empty activity from incomplete evidence and offer equivalent project and catalog navigation. |

## Scope

This mission covers the dashboard and the MCP reads and creation operation needed for parity. Explore retains ownership of the full catalog. Dashboard activity uses its existing seven-day definition. The implementation plan will choose the dialog and chart delivery details and define how partial project creation can be recovered safely. Full OS testing remains part of release qualification.
