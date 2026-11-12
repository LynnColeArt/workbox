# Dashboard and project creation interfaces

## Dashboard read

The browser dashboard and MCP tool `workbox_dashboard` use the same read.
The result includes the UTC start and end of the existing rolling seven-day
window, summary counts, up to ten ranked projects, up to twelve feed entries,
and the Explore destination. Project rows include the project ID and display
name, Git and verified Hubnot counts, latest observed activity, coverage, and
a relative project URL. Include aggregate coverage when incomplete data may
affect the ranking. A known empty snapshot and an incomplete snapshot have
distinct states. The MCP response carries the exact data and a PNG of the
same snapshot. Chart and record links use the same public destinations.

## Creation

`POST /api/projects` and `workbox_create_project` accept `id`, optional
`name`, and optional `description`. Trim strings, default the name to the
ID, and default description to empty. Non-string input and invalid or
reserved IDs are controlled validation failures. Success returns a stable
project ID, relative project URL, and a link or public reference to the
verified founding issue. A completed repository with a failed index is an
explicit partial outcome with an indexing retry path. Other public outcomes
distinguish invalid input, a conflict or active attempt, an initialization
failure with successful cleanup, and recovery requiring inspection.

Use the existing authorized local creation context. Keep repository paths,
raw subprocess diagnostics, private identity data, and private attempt state
inside the server. Test outcomes and input normalization through both entry
points. Use ownership state and exclusive claims to protect existing
repositories and prevent competing attempts from reinitializing a project.
