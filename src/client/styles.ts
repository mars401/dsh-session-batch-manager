/**
 * 注入式样式表与类名/标记常量。
 *
 * 外部插件拿不到宿主的 CSS module 类名（构建期哈希），所以批量 UI 全部用自己的
 * 全局类名 + `--dsw-*` 设计令牌（带回退值），样式表在 overlay 占位挂载时注入一次。
 *
 * 与宿主行 DOM 的耦合（Rows.tsx 的结构契约）：
 * - 会话行是 `div[data-row-key^="session:"]`；
 * - `sidebar.workspaces.session.row.action` 槽渲染在行尾的悬停操作条里——本插件在该槽
 *   放一个隐藏锚点，由锚点的副作用把**自建的选择框按钮**插到行的最前面
 *   （`insertBefore(button, row.firstChild)`），并给行加 `.dsh-batch-row` 标记类。
 *   选择框因此常驻可见、不依赖悬停，选中态（勾选 + 行底色）一直保持，
 *   直到手动清空或批量删除完成。
 * @module client/styles
 */

/** body 上的选择模式标记类。 */
export const BODY_MODE_CLASS = 'dsh-session-batch-mode'

/** 仪表盘打开时 body 上的标记类（隐藏侧栏工具条等）。 */
export const BODY_DASHBOARD_CLASS = 'dsh-dashboard-open'

/** 选中会话行上的标记类。 */
export const ROW_SELECTED_CLASS = 'dsh-batch-selected'

/** 已插入选择框的会话行上的标记类（点击拦截以此识别可选择的行）。 */
export const BATCH_ROW_CLASS = 'dsh-batch-row'

/** 本插件自有 UI 的选择器（点击拦截放行自己的面）。 */
export const OWN_UI_SELECTOR = '[data-dsh-batch-ui]'

/** 仪表盘自有 UI 选择器（与批量工具的 OWN_UI_SELECTOR 共用 data-dsh-batch-ui）。 */
export const DASH_UI_SELECTOR = '[data-dsh-batch-ui]'

/** 样式表元素 id（幂等注入）。 */
export const STYLE_ELEMENT_ID = 'dsh-session-batch-styles'

/** 墓碑隐藏样式表元素 id。 */
export const TOMBSTONE_STYLE_ELEMENT_ID = 'dsh-session-batch-tombstones'

/** 全部样式文本。 */
export const STYLE_TEXT = `
/* 行选择框（插入在行首，常驻可见） */
.dsh-batch-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-inline-end: 7px;
  padding: 0;
  flex: none;
  align-self: center;
  border: 1.5px solid var(--dsw-alias-label-tertiary, rgba(128, 128, 128, .55));
  border-radius: 4px;
  background: transparent;
  color: transparent;
  cursor: pointer;
}
.dsh-batch-check:hover {
  border-color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, .85));
}
.dsh-batch-check-on,
.dsh-batch-check-on:hover {
  background: var(--dsw-alias-button-primary-fill, #3b6cf6);
  border-color: var(--dsw-alias-button-primary-fill, #3b6cf6);
  color: var(--dsw-alias-label-primary-inverted, #fff);
}

/* 选择模式：行点击即切换选中 */
body.dsh-session-batch-mode [data-row-key^="session:"] {
  cursor: pointer;
}

/* 选中行 */
[data-row-key^="session:"].dsh-batch-selected {
  background: var(--dsw-alias-bg-multi-select, rgba(59, 108, 246, .16)) !important;
}

/* 底部工具条 */
.dsh-batch-bar {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100vw - 32px);
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-overlay, rgba(32, 32, 32, .92));
  border: 1px solid rgba(128, 128, 128, .25);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .28);
  backdrop-filter: blur(10px);
  color: var(--dsw-alias-label-primary, #eee);
  font-size: 13px;
}
.dsh-batch-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.dsh-batch-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, .18));
}
.dsh-batch-btn:disabled {
  opacity: .45;
  cursor: default;
}
.dsh-batch-btn-danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger, rgba(242, 85, 90, .18));
  color: var(--dsw-alias-state-warn-label, #f2555a);
}
.dsh-batch-sep {
  width: 1px;
  height: 16px;
  flex: none;
  background: rgba(128, 128, 128, .3);
}
.dsh-batch-count {
  font-weight: 600;
  white-space: nowrap;
  margin-inline-end: 4px;
}
.dsh-batch-busy {
  opacity: .8;
  white-space: nowrap;
}

/* 结果通知 */
.dsh-batch-notice {
  position: fixed;
  left: 50%;
  bottom: 76px;
  transform: translateX(-50%);
  z-index: 1200;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: max-content;
  max-width: min(560px, calc(100vw - 32px));
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-overlay, rgba(32, 32, 32, .94));
  border: 1px solid rgba(128, 128, 128, .25);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .28);
  color: var(--dsw-alias-label-primary, #eee);
  font-size: 13px;
}
.dsh-batch-notice-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-batch-notice-text {
  flex: 1 1 auto;
}
.dsh-batch-notice-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: .7;
}
.dsh-batch-notice-close:hover {
  opacity: 1;
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, .18));
}
.dsh-batch-failures {
  margin: 0;
  padding: 0 0 0 4px;
  list-style: none;
  max-height: 132px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #bbb);
}
.dsh-batch-failures li {
  display: flex;
  gap: 6px;
}
.dsh-batch-fail-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.dsh-batch-fail-reason {
  flex: none;
  opacity: .85;
}
.dsh-batch-notice-action {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, .35);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-batch-notice-action:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, .18));
}

/* 侧栏底部开关 */
.dsh-batch-footer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #aaa);
  font-size: 13px;
  cursor: pointer;
}
.dsh-batch-footer:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, .18));
}
.dsh-batch-footer-on {
  color: var(--dsw-alias-button-primary-fill, #3b6cf6);
}
.dsh-batch-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--dsw-alias-button-primary-fill, #3b6cf6);
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-size: 11px;
}

/* 删除确认对话框 */
.dsh-batch-delete-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 160px;
  overflow-y: auto;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #bbb);
}
.dsh-batch-delete-list li {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-batch-delete-status {
  margin-top: 8px;
  font-size: 12px;
  opacity: .8;
}
.dsh-batch-danger-btn {
  color: var(--dsw-alias-state-warn-label, #f2555a) !important;
}

/* ====== 仪表盘面板（dsh-dash-* 前缀） ====== */

/* 仪表盘打开时隐藏侧栏底部工具条 */
body.dsh-dashboard-open .dsh-batch-bar { display: none; }

/* 面板容器 */
.dsh-dash-panel {
  position: fixed;
  inset: 0;
  z-index: 950;
  padding-top: var(--dsh-frame-top-clearance, 0px);
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base, #1e1e1e);
  color: var(--dsw-alias-label-primary, #eee);
  font-size: 13px;
  animation: dsh-dash-fade-in 150ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-dash-panel { animation: none; }
}
@keyframes dsh-dash-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Header */
.dsh-dash-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 16px;
  flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2));
}
.dsh-dash-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  font-size: 16px;
  font-weight: 500;
}
.dsh-dash-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #888);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-dash-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #aaa);
  cursor: pointer;
  font-size: 14px;
}
.dsh-dash-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18)); }
.dsh-dash-close:disabled { opacity: .45; cursor: default; }

/* 渐进进度条（表格顶缘 2px） */
.dsh-dash-progress-bar {
  height: 2px;
  flex: none;
  background: var(--dsw-alias-border-l3, rgba(128,128,128,.3));
}
.dsh-dash-progress-fill {
  height: 100%;
  background: var(--dsw-alias-button-primary-fill, #3b6cf6);
  transition: width 200ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-dash-progress-fill { transition: none; }
}

/* Toolbar */
.dsh-dash-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 16px;
  flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2));
}
.dsh-dash-toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

/* 表格区 */
.dsh-dash-table-wrapper {
  flex: 1;
  overflow: auto;
}
.dsh-dash-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.dsh-dash-table caption {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
.dsh-dash-th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 36px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #aaa);
  text-align: left;
  background: var(--dsw-alias-bg-base, #1e1e1e);
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2));
  white-space: nowrap;
}
.dsh-dash-th-right { text-align: right; }
.dsh-dash-td {
  height: 40px;
  padding: 0 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12));
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-dash-td-right {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
@media (hover: hover) {
  .dsh-dash-row:hover .dsh-dash-td {
    background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18));
  }
}
.dsh-dash-row-selected .dsh-dash-td {
  background: var(--dsw-alias-bg-multi-select, rgba(59,108,246,.16));
}
.dsh-dash-row-selected:hover .dsh-dash-td {
  background: var(--dsw-alias-bg-multi-select, rgba(59,108,246,.16));
}
.dsh-dash-row { cursor: pointer; }
.dsh-dash-check {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--dsw-alias-button-primary-fill, #3b6cf6);
}

/* 会话格内容 */
.dsh-dash-session-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dsh-dash-session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #eee);
}
/* 子代理标题次级色 */
.dsh-dash-session-title-sub {
  color: var(--dsw-alias-label-secondary, #aaa);
}
/* 展开/折叠按钮 */
.dsh-dash-expand-btn {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-secondary, #aaa);
  font-size: 10px;
  line-height: 20px;
  text-align: center;
  cursor: pointer;
  border-radius: 3px;
}
.dsh-dash-expand-btn:hover {
  background: var(--dsw-alias-bg-hover, rgba(128,128,128,.15));
}
.dsh-dash-expand-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-accent, #5e81f4);
  outline-offset: -2px;
}
/* 树连接线 */
.dsh-dash-tree-connector {
  flex: none;
  width: 12px;
  font-size: 11px;
  color: var(--dsw-alias-border-l2, rgba(128,128,128,.4));
  text-align: center;
  line-height: 1;
}
/* 项目列 */
.dsh-dash-project-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #aaa);
}
.dsh-dash-session-model-sub {
  display: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888);
}
/* 无障碍：屏幕阅读器专用文本（视觉隐藏） */
.dsh-dash-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}
/* 子代理所属主会话小字 */
.dsh-dash-parent-label {
  display: block;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888);
  margin-top: 1px;
  max-width: 12em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-dash-session-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 上下文进度条 */
.dsh-dash-ctx-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
}
.dsh-dash-ctx-track {
  width: 64px;
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-border-l3, rgba(128,128,128,.3));
  flex: none;
}
.dsh-dash-ctx-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--dsw-alias-button-primary-fill, #3b6cf6);
}
.dsh-dash-ctx-fill-warn {
  background: var(--dsw-alias-state-warn-primary, #e8a33d);
}
.dsh-dash-ctx-percent {
  min-width: 36px;
  text-align: right;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, #eee);
}
.dsh-dash-ctx-percent-warn {
  color: var(--dsw-alias-state-warn-primary, #e8a33d);
}
.dsh-dash-ctx-detail {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888);
  font-variant-numeric: tabular-nums;
}

/* 骨架行 */
.dsh-dash-skeleton {
  height: 40px;
  padding: 0 8px;
}
.dsh-dash-skeleton-bar {
  height: 12px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-skeleton, rgba(128,128,128,.18));
}

/* 空态 / 错误态 */
.dsh-dash-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 32px;
}
.dsh-dash-empty-title {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #aaa);
}
.dsh-dash-empty-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #888);
}

/* 通知条（表格顶部） */
.dsh-dash-notice-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #aaa);
  background: var(--dsw-alias-bg-overlay, rgba(32,32,32,.92));
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2));
}
.dsh-dash-notice-bar svg { flex: none; }

/* 错误态居中 */
.dsh-dash-error-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  text-align: center;
}

/* 响应式 */
@media (pointer: coarse) {
  .dsh-dash-td { height: 44px; }
}
@media (max-width: 1079px) {
  .dsh-dash-ctx-detail { display: none; }
}
@media (max-width: 759px) {
  .dsh-dash-model-col { display: none; }
  .dsh-dash-session-model-sub { display: block; }
  .dsh-dash-table-wrapper { overflow-x: auto; }
  /* 召回清单响应式（D15）：隐藏时间与 cwd 列，cwd 并入标题第二行 */
  .dsh-dash-recall-time-col { display: none; }
  .dsh-dash-recall-cell-cwd { display: none; }
  .dsh-dash-recall-cell-cwd-sub { display: inline; }
}
/* 召回清单底部操作条（D15） */
.dsh-dash-recall-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.12));
  background: var(--dsw-alias-bg-base, #1e1e1e);
}
.dsh-dash-recall-footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
/* 召回清单 cwd 并入标题的副行（默认隐藏，<760px 显示） */
.dsh-dash-recall-cell-cwd-sub {
  display: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888);
}
/* 召回清单标题与 cwd 截断 */
.dsh-dash-recall-cell-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-dash-recall-cell-cwd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.dsh-dash-recall-time-col { white-space: nowrap; }
`

/**
 * 幂等注入样式表。
 * @returns 移除函数（元素非本次创建时为无操作）。
 */
export function injectStyles(): () => void {
  if (typeof document === 'undefined') return () => { /* 非浏览器环境：无操作 */ }
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  if (existing !== null) {
    // HMR/重复挂载：刷新文本即可，不让旧实例的清理把新实例的样式带走。
    existing.textContent = STYLE_TEXT
    return () => { /* 由创建者负责移除 */ }
  }
  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
  return () => {
    style.remove()
  }
}

/**
 * 同步墓碑隐藏样式：对每个墓碑 id 生成一条 `display:none` 行规则
 * （行键前缀 `session:`，与 ops/overlay 的 ROW_KEY_PREFIX 一致）。
 * 幂等：文本无变化时不动 DOM；空列表时移除样式元素。
 * @param ids - 墓碑会话 id。
 */
export function syncTombstoneStyles(ids: readonly string[]): void {
  if (typeof document === 'undefined') return
  const css = ids
    .map(id => `div[data-row-key="session:${id}"]{display:none!important}`)
    .join('\n')
  const existing = document.getElementById(TOMBSTONE_STYLE_ELEMENT_ID)
  if (css === '') {
    existing?.remove()
    return
  }
  if (existing !== null) {
    if (existing.textContent !== css) existing.textContent = css
    return
  }
  const style = document.createElement('style')
  style.id = TOMBSTONE_STYLE_ELEMENT_ID
  style.textContent = css
  document.head.appendChild(style)
}

/** 移除墓碑隐藏样式（插件卸载时用；localStorage 里的墓碑不受影响）。 */
export function removeTombstoneStyles(): void {
  if (typeof document === 'undefined') return
  document.getElementById(TOMBSTONE_STYLE_ELEMENT_ID)?.remove()
}
