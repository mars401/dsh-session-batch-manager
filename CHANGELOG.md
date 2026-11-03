# Changelog

All notable changes to this project will be documented in this file.

## 0.1.1 — 2026-11-03

### Fixes

- **Dashboard default filter**: Changed from "All" to "Main sessions" so that subagent sessions are hidden by default (filter tabs remain available for drill-down).
- **Folder-like row bug**: Untitled sessions no longer display the working-directory basename as their title. The dashboard join now reads `sessions.list.title` (the persisted title projection) and falls back to the session ID instead of the `displayTitle` chain which included a directory-basename fallback. Two real-world empty-shell sessions that previously appeared as `workspace`, `AI`, and `Research` now display their session IDs.
- **Blank (draft) rows excluded**: Uncommitted draft sessions (`blank === true`) are no longer included in the dashboard row set, matching the sidebar select-all exclusion. Draft rows have no persistence, no data, and no archive/delete semantics.
- **Truncated title tooltip**: The dashboard title column now wraps the session title in a `Tooltip` (`onlyWhenClipped`, `portal`) so long session IDs (36 chars) are still readable on hover. Matches the existing tooltip on the model column.

### Added

- **`dashboard-rows` module** (`src/client/dashboard-rows.ts`): Extracted `joinDashboardRows` and `filterDashboardRows` as pure, testable functions with no runtime dependencies.
- **Dashboard row tests** (`tests/dashboard-rows.test.mjs`): 14 contract tests against the real source (no mirrors), covering title fallback, blank exclusion, filter semantics, and tooltip presence.
- **Corpus fixtures** (`tests/fixtures/`): Session corpus generator (`gen-screenshot-corpus.mjs`) used for acceptance testing.
- **Acceptance checklist** (`docs/acceptance-session-dashboard-v2.md`): Step-by-step verification guide for the sandbox environment.

First public release.

### Features

- **Sidebar batch operations**: Multi-select sessions, batch archive / unarchive / delete with a floating toolbar. Select all, clear selection, and per-session result reporting with failure details.
- **Stop-and-archive retry**: When batch archiving encounters sessions with running work, the result notice offers a one-click "Stop and archive N running sessions" retry (same upgrade path as the native DSH archive dialog).
- **Full delete pipeline**: Host-side HTTP route with browser trust gating (`x-dsh-session-batch-manager` custom header, Host fence, Fetch Metadata, Origin check). Physical deletion of JSONL log directories (with persistence flush for lazily-materialized sessions, double path validation), registry cleanup (archive-set tombstone for live sessions, workspace detachment for cold sessions), and `api-session/removed` broadcast for immediate GUI row removal.
- **Client-side tombstones**: Deleted session IDs are persisted to localStorage and filtered from all views (including archived) across browser refreshes, preventing live-session ghost rows from reappearing until the host restarts.
- **Session management dashboard**: Full-screen panel accessible from the sidebar footer. **6-column table** with checkboxes, session title + badges (running / subagent / archived / pinned), model, token usage (4-bucket total with per-bucket tooltip), cache read/write, and context pressure percentage (progress bar, ≥90% warning color).
- **4 filter chips**: All / Main sessions / Subagents / Archived, with live counts.
- **In-panel batch operations**: Archive, unarchive, and delete directly from the dashboard panel (independent selection set from the sidebar).
- **Progressive loading**: Fire-and-forget sweep with 1-second throttle. The stats route responds immediately; rows populate progressively. Skeleton screen → incremental row appending → pending count decrement → complete.
- **5-second polling** while the panel is open, paused on visibilitychange. Configurable via `statsPollIntervalMs`.
- **Per-session error isolation**: Corrupt session logs surface as warning-icon rows without breaking the whole table. Degraded mode when `sessionQuery` is unavailable (list + batch operations only).

### Configuration

| Key | Default | Range | Description |
|---|---|---|---|
| `routeBase` | `/dsh-session-batch-manager/v1` | absolute path, no trailing slash | Host route prefix; injected to the page as `window.__DSH_SESSION_BATCH_MANAGER__` |
| `maxBatchSize` | `200` | 1–1000 | Max session IDs per delete request |
| `trustedHosts` | `[]` | host or host:port | Additional trusted authorities for the Host fence |
| `statsPollIntervalMs` | `5000` | 1000–60000 | Dashboard polling interval while panel is open |
| `statsSweepConcurrency` | `4` | 1–16 | Cold-session observation concurrency |

### Routes

| Method | Path | Fence | Purpose |
|---|---|---|---|
| GET | `{routeBase}/status` | none (read-only) | Liveness check |
| POST | `{routeBase}/delete` | Host + custom header + Fetch Metadata + Origin | Batch delete sessions |
| GET | `{routeBase}/stats` | none (read-only) | Session statistics (model / tokens / cache / context) with `cache-control: no-store` |

### Known limitations

- Dashboard initial scan is O(all sessions × all logs); large libraries (hundreds of sessions with long histories) may take minutes. After the first sweep, only sessions whose revision changed are replayed.
- Dashboard tooltips use plain text (dsh Tooltip primitive `label` is `string`, no JSX rich text). Bucket breakdowns are presented as newline-separated key-value pairs.
- Context pressure percentage is an estimate (`contextPressure` is not an atomic observation); it may lag briefly after a model switch.
- **Upgrade from `@local/dsh-session-batch`**: The tombstone storage key and global config key have changed. Old tombstones are not migrated—previously deleted sessions may reappear as ghost rows once; delete them again to re-establish tombstones. The old plugin must be removed from the sandbox before installing the new one.

### Compatibility

- **compat**: Fully verified with DSH 0.2.2-alpha.2 (Web UI, dev sandbox). Desktop App 0.2.1-rc.5: all seven coupling points confirmed present in app bundle via static grep — runtime verification pending. Plugin declares `dsh: ">=0.2.1"` in engines. Core features use stable APIs available since 0.2.1; dashboard stats degrade gracefully on builds without `sessionQuery`.