# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0 — 2026-11-05

### Features

- **Session dashboard panel** (`shell.overlay`): Full-screen session management table with token usage, cache hit, and context pressure visualization. Stats backend with auto-polling, real-time aggregation, and concurrency capping.
- **Two-pane tree view** (main / archived): Main sessions are shown as tree roots with their subagents nested underneath (collapsible, depth-1 flatten). The archived pane shows archived sessions with lineage-archived descendants in grey. Fork sessions are independent tree roots with full checkbox/archive/restore/delete parity.
- **Lineage-based archive/delete cascade**: Archiving or deleting a main session cascades to all its subagent descendants. Lineage propagation stops at non-subagent (fork) rows. The delete confirmation dialog names the exact descendant count.
- **Recall banner** (`dash.recall.*`): Banner detects new workspaces added since the plugin's startup baseline snapshot and offers a one-click "Recall" workflow — a checklist of ungrouped sessions ready for workspace attachment, with per-line lineage subagent counts (parentId chain, not cwd proximity).
- **Recall checklist mode**: Four-column table (checkbox, title, updated-at YYYY-MM-DD, cwd) with select-all, bottom action bar ("Cancel" + "Recall {k} sessions"), focus management (entry→back button, exit→banner View button or close), and <760px responsive rules (timestamp/cwd collapse, cwd merges into title sub-line).
- **POST /recall route**: Host-side endpoint with trust gating (`isTrustedBatchRequest`), `resolveByPath` workspace lookup (no implicit creation), `attachSession` per-row with five failure branches (`cwd-unresolvable`, `cwd-not-directory`, `cwd-mismatch`, `no-cwd`, `attach-failed`), and mixed-batch tolerance (one failure does not block others).

### Fixes

- **Δ=0 contract**: Dashboard session count now matches the sidebar visible main session count. Subagents are nested under their parent row and are not counted as independent chips. Old "All / Subagents" filters removed; chips now show "Main N / Archived M".
- **Row-set flip**: Stats-only sessions (header present but not in `sessions.list`) are no longer emitted as orphaned rows. The join direction was reversed from left-join(stats, sessions) to inner-join(sessions, stats), matching the original design intent.
- **Blank draft exclusion**: Sessions with `blank === true` are excluded from the dashboard row set with a single-key check, consistent with the sidebar select-all exclusion. No per-field heuristics.
- **Title display**: Dashboard titles now use the persisted `title` projection with a plain id fallback, never the `displayTitle` chain which included a directory-basename fallback.
- **Truncated title tooltip**: Title column wrapped in `Tooltip` (`onlyWhenClipped`, `portal`) so long session IDs are readable on hover.
- **Cascade truncation guard** (TC-22): Source-level assertion that `.parentId` is only used in `parentDisplay` and fork Tag blocks within `DashboardPanel.tsx` — cascade/lineage propagation only traverses the `buildTree` children map.

### Added

- **`dashboard-rows` module**: Extracted `joinDashboardRows` and `filterDashboardRows` as pure, testable functions.
- **`dashboard-tree` module**: Extracted `buildTree`, `visibleRows`, `descendantsOf` as pure functions — lineage tree construction, flatten, and fork truncation.
- **`dashboard-recall` module**: Extracted `computeRecallCandidates` as a pure function — cwd-based grouping, parentId-chain lineage counting with fork boundary.
- **`dashboard-store` module**: Dashboard panel state store with filter/selection/expand/recall-mode/baseline management.
- **Contract test suites** (67 tests across 6 suites):
  - `tests/dashboard-rows.test.mjs` (20 tests): Title fallback, blank exclusion, filter semantics, tooltip presence, cascade truncation source guard.
  - `tests/dashboard-tree.test.mjs` (20 tests): Tree construction, flatten, fork root parity, lineage archive, children invariant (filters-order independent).
  - `tests/dashboard-recall.test.mjs` (17 tests): Recall candidate grouping, cwd normalization, lineage counting with fork truncation.
  - `tests/dashboard-stats.test.mjs` (10 tests): Stats aggregator revision skip, concurrency cap, dedup throttle, error isolation.
  - `tests/fixtures/`: Corpus generators and verification scripts for acceptance testing.
- **Acceptance docs**: `docs/acceptance-session-dashboard-v3.md`, `docs/acceptance-session-dashboard-v4.md`, `docs/design-session-dashboard.md`, `docs/ui-session-dashboard.md`.
- **I18n**: `dash.recall.*` (11 keys), `notice.code.cwd-*` (5 keys), `dash.fork.tag` / `dash.fork.origin` (2 keys), plus fork Tag and new filter chip labels. Removed dead keys `dash.filter.all` / `dash.filter.subagent` / `dash.recall.failureDetail`.

### Fixes

- **Dashboard default filter**: Changed from "All" to "Main sessions" so that subagent sessions are hidden by default (filter tabs remain available for drill-down).
- **Folder-like row bug**: Untitled sessions no longer display the working-directory basename as their title. The dashboard join now reads `sessions.list.title` (the persisted title projection) and falls back to the session ID instead of the `displayTitle` chain which included a directory-basename fallback. Two real-world empty-shell sessions that previously appeared as `workspace`, `AI`, and `Research` now display their session IDs.
- **Blank (draft) rows excluded**: Uncommitted draft sessions (`blank === true`) are no longer included in the dashboard row set, matching the sidebar select-all exclusion. Draft rows have no persistence, no data, and no archive/delete semantics.
- **Truncated title tooltip**: The dashboard title column now wraps the session title in a `Tooltip` (`onlyWhenClipped`, `portal`) so long session IDs (36 chars) are still readable on hover. Matches the existing tooltip on the model column.
- **Built artifacts report correct version**: The initial 0.1.1 push had `lib/host/index.js` still embedding `"0.1.0"` in three places (`/status`, index-inject, `/stats`). Rebuilt artifacts now report `"0.1.1"`.

### Added

- **`dashboard-rows` module** (`src/client/dashboard-rows.ts`): Extracted `joinDashboardRows` and `filterDashboardRows` as pure, testable functions with no runtime dependencies.
- **Dashboard row tests** (`tests/dashboard-rows.test.mjs`): 14 contract tests against the real source (no mirrors), covering title fallback, blank exclusion, filter semantics, and tooltip presence.
- **Corpus fixtures** (`tests/fixtures/`): Session corpus generator (`gen-screenshot-corpus.mjs`) used for acceptance testing.
- **Acceptance checklist** (`docs/acceptance-session-dashboard-v2.md`): Step-by-step verification guide for the sandbox environment.

## 0.1.0 — 2026-11-03

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