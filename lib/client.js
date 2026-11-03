window.__ModuleLoader__.load({ id: "dsh-session-batch-manager", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_dsh_client_store3 = require("@deepseek-ai/dsh-client-store");
var import_react4 = require("react");

// src/client/store.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
var TOMBSTONE_STORAGE_KEY = "dsh-session-batch-manager.tombstones";
var TOMBSTONE_CAP = 200;
function loadTombstones() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(TOMBSTONE_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && id !== "").slice(-TOMBSTONE_CAP);
  } catch {
    return [];
  }
}
function saveTombstones(ids) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify(ids));
  } catch {
  }
}
var INITIAL_STATE = {
  mode: "off",
  selected: [],
  busy: null,
  confirmDelete: null,
  notice: null,
  tombstones: loadTombstones()
};
function createBatchStore() {
  const store = (0, import_dsh_client_store.createSnapshotStore)(INITIAL_STATE);
  let noticeSeq2 = 0;
  const update = (patch) => {
    store.set({ ...store.getSnapshot(), ...patch });
  };
  return {
    source: store,
    get: () => store.getSnapshot(),
    setMode(mode, seed) {
      if (mode === "off") {
        update({ mode, confirmDelete: null });
        return;
      }
      const current = store.getSnapshot().selected;
      update(seed === void 0 ? { mode } : { mode, selected: [.../* @__PURE__ */ new Set([...current, ...seed])] });
    },
    toggle(sessionId) {
      const current = store.getSnapshot().selected;
      update({
        selected: current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId]
      });
    },
    setSelected(ids) {
      update({ selected: [...new Set(ids)] });
    },
    addSelected(ids) {
      update({ selected: [.../* @__PURE__ */ new Set([...store.getSnapshot().selected, ...ids])] });
    },
    clearSelection() {
      update({ selected: [] });
    },
    setBusy(labelKey, done, total) {
      update({ busy: { labelKey, done, total } });
    },
    advanceBusy() {
      const busy = store.getSnapshot().busy;
      if (busy === null) return;
      update({ busy: { ...busy, done: busy.done + 1 } });
    },
    clearBusy() {
      update({ busy: null });
    },
    requestDeleteConfirm() {
      update({ confirmDelete: store.getSnapshot().selected });
    },
    closeConfirm() {
      update({ confirmDelete: null });
    },
    showNotice(notice) {
      noticeSeq2 += 1;
      update({ notice: { ...notice, seq: noticeSeq2 } });
    },
    dismissNotice() {
      update({ notice: null });
    },
    addTombstones(ids) {
      if (ids.length === 0) return;
      const current = store.getSnapshot().tombstones;
      const merged = [.../* @__PURE__ */ new Set([...current, ...ids])];
      const capped = merged.length > TOMBSTONE_CAP ? merged.slice(merged.length - TOMBSTONE_CAP) : merged;
      saveTombstones(capped);
      update({ tombstones: capped });
    }
  };
}
function deriveSource(source, derive) {
  let lastInput;
  let lastOutput;
  let initialized = false;
  return {
    getSnapshot() {
      const input = source.getSnapshot();
      if (!initialized || input !== lastInput) {
        lastInput = input;
        lastOutput = derive(input);
        initialized = true;
      }
      return lastOutput;
    },
    subscribe: (listener) => source.subscribe(listener)
  };
}

// src/client/dashboard-store.ts
var import_dsh_client_store2 = require("@deepseek-ai/dsh-client-store");
var INITIAL = {
  open: false,
  filter: "all",
  selected: [],
  busy: null,
  confirmDelete: null,
  notice: null
};
var noticeSeq = 0;
function createDashboardStore() {
  const store = (0, import_dsh_client_store2.createSnapshotStore)(INITIAL);
  const update = (patch) => {
    store.set({ ...store.getSnapshot(), ...patch });
  };
  return {
    source: store,
    get: () => store.getSnapshot(),
    open() {
      update({ open: true });
    },
    close() {
      const current = store.getSnapshot();
      if (current.busy !== null) return;
      update({ open: false, selected: [] });
    },
    setFilter(filter) {
      update({ filter, selected: [] });
    },
    toggleSelect(id) {
      const current = store.getSnapshot().selected;
      update({
        selected: current.includes(id) ? current.filter((i) => i !== id) : [...current, id]
      });
    },
    selectAll(ids) {
      update({ selected: [...new Set(ids)] });
    },
    clearSelection() {
      update({ selected: [] });
    },
    setBusy(labelKey, done, total) {
      update({ busy: { labelKey, done, total } });
    },
    advanceBusy() {
      const busy = store.getSnapshot().busy;
      if (busy === null) return;
      update({ busy: { ...busy, done: busy.done + 1 } });
    },
    clearBusy() {
      update({ busy: null });
    },
    requestDeleteConfirm() {
      update({ confirmDelete: store.getSnapshot().selected });
    },
    closeConfirm() {
      update({ confirmDelete: null });
    },
    showNotice(notice) {
      noticeSeq += 1;
      update({ notice: { ...notice, seq: noticeSeq } });
    },
    dismissNotice() {
      update({ notice: null });
    }
  };
}

// src/client/ops.ts
var ACTIVE_REFUSAL_CODE = "workspace/session-active";
var ROW_KEY_PREFIX = "session:";
var DEFAULT_ROUTE_BASE = "/dsh-session-batch-manager/v1";
function discoverRouteBase() {
  const injected = typeof window === "undefined" ? void 0 : window.__DSH_SESSION_BATCH_MANAGER__;
  const base = injected?.routeBase;
  if (typeof base === "string" && base.startsWith("/")) return base.replace(/\/+$/, "");
  return DEFAULT_ROUTE_BASE;
}
function isSessionActiveRefusal(reason) {
  return reason instanceof Error && reason.name === "WorkspaceArchiveError" && reason.rpcError?.code === ACTIVE_REFUSAL_CODE;
}
function failureMessage(reason) {
  if (reason instanceof Error && reason.message !== "") return reason.message;
  return String(reason);
}
var DeleteRequestError = class extends Error {
  /** 失败分类（映射到 `notice.code.*` 字典键）。 */
  code;
  constructor(code, message) {
    super(message);
    this.name = "DeleteRequestError";
    this.code = code;
  }
};
async function runArchiveCore(ids, workspaces, titleOf, stopActivity, opts) {
  const active = [];
  const failures = [];
  let ok = 0;
  for (const id of ids) {
    try {
      await workspaces.archiveSession(id, stopActivity ? { stopActivity: true } : void 0);
      ok += 1;
      opts?.onProgress?.();
    } catch (reason) {
      if (!stopActivity && isSessionActiveRefusal(reason)) active.push(id);
      else failures.push({ id, title: titleOf(id), code: "archive-failed", message: failureMessage(reason) });
    }
  }
  return { ok, active, failures };
}
async function runUnarchiveCore(ids, workspaces, titleOf, opts) {
  const failures = [];
  let ok = 0;
  for (const id of ids) {
    try {
      await workspaces.unarchiveSession(id);
      ok += 1;
      opts?.onProgress?.();
    } catch (reason) {
      failures.push({ id, title: titleOf(id), code: "unarchive-failed", message: failureMessage(reason) });
    }
  }
  return { ok, failures };
}
async function runDeleteCore(ids, routeBase, titleOf) {
  if (ids.length === 0) return { okIds: [], failures: [] };
  let response;
  try {
    response = await fetch(`${routeBase}/delete`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dsh-session-batch-manager": "1" },
      body: JSON.stringify({ sessionIds: ids })
    });
  } catch {
    throw new DeleteRequestError("network", "fetch failed");
  }
  if (response.status === 404) {
    throw new DeleteRequestError("route-unavailable", `HTTP 404 from ${routeBase}/delete`);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.message ?? body.error ?? "";
    } catch {
    }
    throw new DeleteRequestError("network", detail !== "" ? detail : `HTTP ${String(response.status)}`);
  }
  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results : [];
  const okIds = results.filter((result) => result.ok).map((result) => result.sessionId);
  const failures = results.filter((result) => !result.ok).map((result) => ({
    id: result.sessionId,
    title: titleOf(result.sessionId),
    code: result.code ?? "internal",
    message: result.message
  }));
  const seen = new Set(results.map((result) => result.sessionId));
  for (const id of ids) {
    if (!seen.has(id)) failures.push({ id, title: titleOf(id), code: "internal" });
  }
  return { okIds, failures };
}
function showArchiveNotice(store, result, stopActivity, retryBatch) {
  const { ok, active, failures } = result;
  if (active.length === 0 && failures.length === 0) {
    store.showNotice(ok > 0 ? { kind: "success", textKey: "notice.archived", params: { n: ok } } : { kind: "info", textKey: "notice.noneArchived" });
    return;
  }
  store.showNotice({
    kind: "error",
    textKey: ok > 0 ? "notice.archived" : "notice.noneArchived",
    params: { n: ok },
    failures: [
      ...active.map((id) => ({ id, title: "", code: "active" })),
      ...failures
    ],
    action: active.length > 0 && !stopActivity && retryBatch !== void 0 ? {
      labelKey: "notice.stopAndArchive",
      params: { n: active.length },
      run: retryBatch
    } : void 0
  });
}
function createBatchOps(sessions, workspaces, store) {
  const routeBase = discoverRouteBase();
  const archivedIdsSource = deriveSource(
    workspaces.list,
    (snapshot) => new Set(snapshot.archivedSessionIds)
  );
  const titleOf = (sessionId) => {
    const title = sessions.list.getSnapshot().byId[sessionId]?.displayTitle;
    return typeof title === "string" && title !== "" ? title : sessionId;
  };
  const selectAllVisible = () => {
    const byId = sessions.list.getSnapshot().byId;
    const tombstones = new Set(store.get().tombstones);
    const ids = [];
    document.querySelectorAll(`[data-row-key^="${ROW_KEY_PREFIX}"]`).forEach((element) => {
      const id = (element.getAttribute("data-row-key") ?? "").slice(ROW_KEY_PREFIX.length);
      if (id === "") return;
      const row = byId[id];
      if (row === void 0 || row.blank === true || row.origin === "subagent") return;
      if (tombstones.has(id)) return;
      if (typeof getComputedStyle === "function" && getComputedStyle(element).display === "none") return;
      ids.push(id);
    });
    store.addSelected(ids);
  };
  const runArchiveLoop = async (ids, stopActivity) => {
    if (ids.length === 0) return;
    store.dismissNotice();
    store.setBusy("bar.busyArchiving", 0, ids.length);
    const result = await runArchiveCore(ids, workspaces, titleOf, stopActivity, {
      onProgress: () => store.advanceBusy()
    });
    store.clearBusy();
    store.clearSelection();
    const activeIds = result.active;
    showArchiveNotice(store, result, stopActivity, () => {
      void runArchiveLoop(activeIds, true);
    });
  };
  const runUnarchiveLoop = async (ids) => {
    if (ids.length === 0) return;
    store.dismissNotice();
    store.setBusy("bar.busyUnarchiving", 0, ids.length);
    const result = await runUnarchiveCore(ids, workspaces, titleOf, {
      onProgress: () => store.advanceBusy()
    });
    store.clearBusy();
    store.clearSelection();
    if (result.failures.length === 0) {
      store.showNotice(result.ok > 0 ? { kind: "success", textKey: "notice.unarchived", params: { n: result.ok } } : { kind: "info", textKey: "notice.noneUnarchived" });
      return;
    }
    store.showNotice({
      kind: "error",
      textKey: result.ok > 0 ? "notice.unarchived" : "notice.noneUnarchived",
      params: { n: result.ok },
      failures: result.failures
    });
  };
  const runDeleteAsync = async (ids) => {
    if (ids.length === 0) return;
    store.closeConfirm();
    store.dismissNotice();
    store.setBusy("bar.busyDeleting", 0, ids.length);
    try {
      const result = await runDeleteCore(ids, routeBase, titleOf);
      if (result.okIds.length > 0) store.addTombstones(result.okIds);
      store.clearSelection();
      try {
        await sessions.refresh();
      } catch {
      }
      store.clearBusy();
      if (result.failures.length === 0) {
        store.showNotice({ kind: "success", textKey: "notice.deleted", params: { n: result.okIds.length } });
        return;
      }
      store.showNotice({
        kind: "error",
        textKey: result.okIds.length > 0 ? "notice.deleted" : "notice.noneDeleted",
        params: { n: result.okIds.length },
        failures: result.failures
      });
    } catch (reason) {
      store.clearBusy();
      const code = reason instanceof DeleteRequestError ? reason.code : "internal";
      store.showNotice({
        kind: "error",
        textKey: "notice.noneDeleted",
        failures: [{ id: "", title: "", code, message: failureMessage(reason) }]
      });
    }
  };
  return {
    archivedIdsSource,
    routeBase,
    peekState: () => store.get(),
    watchBatch: (listener) => store.source.subscribe(listener),
    enterSelect: (seed) => {
      store.setMode("select", seed);
    },
    exitSelect: () => {
      store.setMode("off");
    },
    toggleSession: (sessionId) => {
      store.toggle(sessionId);
    },
    selectAllVisible,
    clearSelection: () => {
      store.clearSelection();
    },
    runArchive: (ids) => {
      void runArchiveLoop(ids, false);
    },
    runUnarchive: (ids) => {
      void runUnarchiveLoop(ids);
    },
    requestDeleteConfirm: () => {
      store.requestDeleteConfirm();
    },
    closeConfirm: () => {
      store.closeConfirm();
    },
    runDelete: (ids) => {
      void runDeleteAsync(ids);
    },
    dismissNotice: () => {
      store.dismissNotice();
    },
    titleOf
  };
}

// src/client/locales.ts
var NS = "sessionBatch";
var zh = {
  "footer.toggle": "\u6279\u91CF\u7BA1\u7406\u4F1A\u8BDD",
  "footer.label": "\u6279\u91CF\u7BA1\u7406",
  "row.select": "\u9009\u62E9\u6B64\u4F1A\u8BDD",
  "row.unselect": "\u53D6\u6D88\u9009\u62E9\u6B64\u4F1A\u8BDD",
  "menu.selectBatch": "\u6279\u91CF\u9009\u62E9\u4F1A\u8BDD",
  "bar.aria": "\u4F1A\u8BDD\u6279\u91CF\u64CD\u4F5C\u5DE5\u5177\u6761",
  "bar.selected": "\u5DF2\u9009\u62E9 {n} \u4E2A\u4F1A\u8BDD",
  "bar.selectAll": "\u5168\u9009",
  "bar.clear": "\u6E05\u7A7A",
  "bar.archive": "\u5F52\u6863",
  "bar.unarchive": "\u6062\u590D",
  "bar.delete": "\u5220\u9664",
  "bar.exit": "\u9000\u51FA",
  "bar.busyArchiving": "\u6B63\u5728\u5F52\u6863",
  "bar.busyUnarchiving": "\u6B63\u5728\u6062\u590D",
  "bar.busyDeleting": "\u6B63\u5728\u5220\u9664",
  "delete.title": "\u5220\u9664 {n} \u4E2A\u4F1A\u8BDD\uFF1F",
  "delete.desc": "\u5C06\u6C38\u4E45\u5220\u9664\u6240\u9009\u4F1A\u8BDD\u7684\u65E5\u5FD7\u6587\u4EF6\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002\u6B63\u5728\u8FD0\u884C\u6216\u5DF2\u5728\u5BF9\u8BDD\u4E2D\u6253\u5F00\u7684\u4F1A\u8BDD\u4F1A\u88AB\u8DF3\u8FC7\u3002",
  "delete.confirm": "\u5220\u9664",
  "delete.cancel": "\u53D6\u6D88",
  "delete.pending": "\u6B63\u5728\u5220\u9664\u2026",
  "delete.more": "\u2026\u53E6\u6709 {n} \u4E2A",
  "notice.archived": "\u5DF2\u5F52\u6863 {n} \u4E2A\u4F1A\u8BDD",
  "notice.unarchived": "\u5DF2\u6062\u590D {n} \u4E2A\u4F1A\u8BDD",
  "notice.deleted": "\u5DF2\u5220\u9664 {n} \u4E2A\u4F1A\u8BDD",
  "notice.noneArchived": "\u6CA1\u6709\u4F1A\u8BDD\u88AB\u5F52\u6863",
  "notice.noneUnarchived": "\u6CA1\u6709\u4F1A\u8BDD\u88AB\u6062\u590D",
  "notice.noneDeleted": "\u6CA1\u6709\u4F1A\u8BDD\u88AB\u5220\u9664",
  "notice.failedCount": "{n} \u4E2A\u5931\u8D25",
  "notice.stopAndArchive": "\u505C\u6B62\u5E76\u5F52\u6863 {n} \u4E2A\u8FD0\u884C\u4E2D\u7684\u4F1A\u8BDD",
  "notice.close": "\u5173\u95ED",
  "notice.code.active": "\u6709\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C",
  "notice.code.live": "\u5DF2\u5728\u5BF9\u8BDD\u4E2D\u6253\u5F00",
  "notice.code.not-found": "\u672A\u627E\u5230\u6301\u4E45\u5316\u65E5\u5FD7",
  "notice.code.invalid-id": "\u4F1A\u8BDD id \u975E\u6CD5",
  "notice.code.unsafe-path": "\u8DEF\u5F84\u6821\u9A8C\u5931\u8D25",
  "notice.code.unsupported-backend": "\u4E0D\u652F\u6301\u7684\u5B58\u50A8\u540E\u7AEF",
  "notice.code.no-persistence": "\u6301\u4E45\u5316\u670D\u52A1\u4E0D\u53EF\u7528",
  "notice.code.internal": "\u5185\u90E8\u9519\u8BEF",
  "notice.code.archive-failed": "\u5F52\u6863\u5931\u8D25",
  "notice.code.unarchive-failed": "\u6062\u590D\u5931\u8D25",
  "notice.code.route-unavailable": "\u5BBF\u4E3B\u5220\u9664\u8DEF\u7531\u4E0D\u53EF\u7528\uFF08\u63D2\u4EF6\u5BBF\u4E3B\u534A\u672A\u52A0\u8F7D\uFF1F\uFF09",
  "notice.code.network": "\u8BF7\u6C42\u5931\u8D25",
  // 仪表盘（dash.* 键）
  "dash.entry": "\u4F1A\u8BDD\u7BA1\u7406",
  "dash.title": "\u4F1A\u8BDD\u7BA1\u7406",
  "dash.panel.aria": "\u4F1A\u8BDD\u7BA1\u7406",
  "dash.close": "\u5173\u95ED",
  "dash.refresh": "\u5237\u65B0",
  "dash.filter.all": "\u5168\u90E8",
  "dash.filter.main": "\u4E3B\u4F1A\u8BDD",
  "dash.filter.subagent": "\u5B50\u4EE3\u7406",
  "dash.filter.archived": "\u5DF2\u5F52\u6863",
  "dash.selectAll.aria": "\u5168\u9009\u5F53\u524D\u89C6\u56FE\u7684 {n} \u4E2A\u4F1A\u8BDD",
  "dash.row.select.aria": "\u9009\u62E9\u4F1A\u8BDD {title}",
  "dash.col.session": "\u4F1A\u8BDD",
  "dash.col.model": "\u6A21\u578B",
  "dash.col.tokens": "Token \u6D88\u8017",
  "dash.col.cache": "\u7F13\u5B58\u8BFB/\u5199",
  "dash.col.context": "\u4E0A\u4E0B\u6587",
  "dash.table.caption": "\u4F1A\u8BDD\u8D44\u6E90\u7528\u91CF\u7EDF\u8BA1",
  "dash.pending": "\u6B63\u5728\u8BFB\u53D6 {n} \u4E2A\u4F1A\u8BDD\u2026",
  "dash.updatedAt": "\u5DF2\u66F4\u65B0 {time}",
  "dash.progress.aria": "\u4F1A\u8BDD\u7EDF\u8BA1\u8BFB\u53D6\u8FDB\u5EA6",
  "dash.badge.running": "\u8FD0\u884C\u4E2D",
  "dash.badge.subagent": "\u5B50\u4EE3\u7406",
  "dash.badge.archived": "\u5DF2\u5F52\u6863",
  "dash.badge.pinned": "\u7F6E\u9876",
  "dash.noData": "\u65E0\u6570\u636E",
  "dash.error.corrupt": "\u4F1A\u8BDD\u65E5\u5FD7\u5DF2\u635F\u574F",
  "dash.error.read-failed": "\u8BFB\u53D6\u4F1A\u8BDD\u65E5\u5FD7\u5931\u8D25",
  "dash.tip.input": "\u8F93\u5165\uFF08\u672A\u7F13\u5B58\uFF09",
  "dash.tip.output": "\u8F93\u51FA",
  "dash.tip.cacheRead": "\u7F13\u5B58\u8BFB",
  "dash.tip.cacheWrite": "\u7F13\u5B58\u5199",
  "dash.tip.usageNote": "\u8BE5\u4F1A\u8BDD\u7D2F\u8BA1\u603B\u91CF\uFF0C\u542B fork \u7EE7\u627F\u7684\u524D\u7F00",
  "dash.tip.context": "~{used} / {window} \xB7 {percent}%",
  "dash.tip.contextNote": "\u4E0B\u4E00\u6B21\u8BF7\u6C42\u7684\u9884\u4F30\u503C\uFF0C\u4EC5\u4F9B\u53C2\u8003\uFF1B\u5207\u6362\u6A21\u578B\u540E\u53EF\u80FD\u77ED\u6682\u6EDE\u540E",
  "dash.empty.title": "\u6CA1\u6709\u4F1A\u8BDD",
  "dash.empty.desc": "\u521B\u5EFA\u4F1A\u8BDD\u540E\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC",
  "dash.emptyFiltered.title": "\u8BE5\u8FC7\u6EE4\u6761\u4EF6\u4E0B\u6CA1\u6709\u4F1A\u8BDD",
  "dash.emptyFiltered.clear": "\u6E05\u9664\u8FC7\u6EE4",
  "dash.loadFailed": "\u7EDF\u8BA1\u6570\u636E\u52A0\u8F7D\u5931\u8D25",
  "dash.retry": "\u91CD\u8BD5",
  "dash.degraded": "\u4F1A\u8BDD\u7EDF\u8BA1\u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u4EC5\u663E\u793A\u5217\u8868\u4E0E\u6279\u91CF\u64CD\u4F5C"
};
var en = {
  "footer.toggle": "Batch manage sessions",
  "footer.label": "Batch",
  "row.select": "Select this session",
  "row.unselect": "Unselect this session",
  "menu.selectBatch": "Select sessions in batch",
  "bar.aria": "Session batch action toolbar",
  "bar.selected": "{n} session(s) selected",
  "bar.selectAll": "Select all",
  "bar.clear": "Clear",
  "bar.archive": "Archive",
  "bar.unarchive": "Unarchive",
  "bar.delete": "Delete",
  "bar.exit": "Exit",
  "bar.busyArchiving": "Archiving",
  "bar.busyUnarchiving": "Unarchiving",
  "bar.busyDeleting": "Deleting",
  "delete.title": "Delete {n} session(s)?",
  "delete.desc": "Permanently deletes the log files of the selected sessions. This cannot be undone. Running or currently open sessions are skipped.",
  "delete.confirm": "Delete",
  "delete.cancel": "Cancel",
  "delete.pending": "Deleting\u2026",
  "delete.more": "\u2026and {n} more",
  "notice.archived": "Archived {n} session(s)",
  "notice.unarchived": "Unarchived {n} session(s)",
  "notice.deleted": "Deleted {n} session(s)",
  "notice.noneArchived": "No session was archived",
  "notice.noneUnarchived": "No session was unarchived",
  "notice.noneDeleted": "No session was deleted",
  "notice.failedCount": "{n} failed",
  "notice.stopAndArchive": "Stop and archive {n} running session(s)",
  "notice.close": "Close",
  "notice.code.active": "has running work",
  "notice.code.live": "is open in a conversation",
  "notice.code.not-found": "no persisted log found",
  "notice.code.invalid-id": "invalid session id",
  "notice.code.unsafe-path": "path check failed",
  "notice.code.unsupported-backend": "unsupported persistence backend",
  "notice.code.no-persistence": "persistence service unavailable",
  "notice.code.internal": "internal error",
  "notice.code.archive-failed": "archive failed",
  "notice.code.unarchive-failed": "unarchive failed",
  "notice.code.route-unavailable": "host delete route unavailable (host half not loaded?)",
  "notice.code.network": "request failed",
  // Dashboard (dash.* keys)
  "dash.entry": "Session management",
  "dash.title": "Session management",
  "dash.panel.aria": "Session management",
  "dash.close": "Close",
  "dash.refresh": "Refresh",
  "dash.filter.all": "All",
  "dash.filter.main": "Main",
  "dash.filter.subagent": "Subagents",
  "dash.filter.archived": "Archived",
  "dash.selectAll.aria": "Select all {n} sessions in current view",
  "dash.row.select.aria": "Select session {title}",
  "dash.col.session": "Session",
  "dash.col.model": "Model",
  "dash.col.tokens": "Token Usage",
  "dash.col.cache": "Cache R/W",
  "dash.col.context": "Context",
  "dash.table.caption": "Session resource usage statistics",
  "dash.pending": "Reading {n} sessions\u2026",
  "dash.updatedAt": "Updated {time}",
  "dash.progress.aria": "Session statistics reading progress",
  "dash.badge.running": "Running",
  "dash.badge.subagent": "Subagent",
  "dash.badge.archived": "Archived",
  "dash.badge.pinned": "Pinned",
  "dash.noData": "No data",
  "dash.error.corrupt": "Session log is corrupt",
  "dash.error.read-failed": "Failed to read session log",
  "dash.tip.input": "Input (uncached)",
  "dash.tip.output": "Output",
  "dash.tip.cacheRead": "Cache read",
  "dash.tip.cacheWrite": "Cache write",
  "dash.tip.usageNote": "Cumulative session total, including fork-inherited prefix",
  "dash.tip.context": "~{used} / {window} \xB7 {percent}%",
  "dash.tip.contextNote": "Estimate for next request, for reference only; may lag briefly after model switch",
  "dash.empty.title": "No sessions",
  "dash.empty.desc": "Sessions will appear here after creation",
  "dash.emptyFiltered.title": "No sessions match this filter",
  "dash.emptyFiltered.clear": "Clear filter",
  "dash.loadFailed": "Failed to load statistics",
  "dash.retry": "Retry",
  "dash.degraded": "Session statistics service unavailable, showing list and batch operations only"
};

// src/client/RowCheckbox.tsx
var import_react = require("react");

// src/client/styles.ts
var BODY_MODE_CLASS = "dsh-session-batch-mode";
var BODY_DASHBOARD_CLASS = "dsh-dashboard-open";
var ROW_SELECTED_CLASS = "dsh-batch-selected";
var BATCH_ROW_CLASS = "dsh-batch-row";
var OWN_UI_SELECTOR = "[data-dsh-batch-ui]";
var STYLE_ELEMENT_ID = "dsh-session-batch-styles";
var TOMBSTONE_STYLE_ELEMENT_ID = "dsh-session-batch-tombstones";
var STYLE_TEXT = `
/* \u884C\u9009\u62E9\u6846\uFF08\u63D2\u5165\u5728\u884C\u9996\uFF0C\u5E38\u9A7B\u53EF\u89C1\uFF09 */
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

/* \u9009\u62E9\u6A21\u5F0F\uFF1A\u884C\u70B9\u51FB\u5373\u5207\u6362\u9009\u4E2D */
body.dsh-session-batch-mode [data-row-key^="session:"] {
  cursor: pointer;
}

/* \u9009\u4E2D\u884C */
[data-row-key^="session:"].dsh-batch-selected {
  background: var(--dsw-alias-bg-multi-select, rgba(59, 108, 246, .16)) !important;
}

/* \u5E95\u90E8\u5DE5\u5177\u6761 */
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

/* \u7ED3\u679C\u901A\u77E5 */
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

/* \u4FA7\u680F\u5E95\u90E8\u5F00\u5173 */
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

/* \u5220\u9664\u786E\u8BA4\u5BF9\u8BDD\u6846 */
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

/* ====== \u4EEA\u8868\u76D8\u9762\u677F\uFF08dsh-dash-* \u524D\u7F00\uFF09 ====== */

/* \u4EEA\u8868\u76D8\u6253\u5F00\u65F6\u9690\u85CF\u4FA7\u680F\u5E95\u90E8\u5DE5\u5177\u6761 */
body.dsh-dashboard-open .dsh-batch-bar { display: none; }

/* \u9762\u677F\u5BB9\u5668 */
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

/* \u6E10\u8FDB\u8FDB\u5EA6\u6761\uFF08\u8868\u683C\u9876\u7F18 2px\uFF09 */
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

/* \u8868\u683C\u533A */
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

/* \u4F1A\u8BDD\u683C\u5185\u5BB9 */
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
.dsh-dash-session-model-sub {
  display: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888);
}
.dsh-dash-session-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* \u4E0A\u4E0B\u6587\u8FDB\u5EA6\u6761 */
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

/* \u9AA8\u67B6\u884C */
.dsh-dash-skeleton {
  height: 40px;
  padding: 0 8px;
}
.dsh-dash-skeleton-bar {
  height: 12px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-skeleton, rgba(128,128,128,.18));
}

/* \u7A7A\u6001 / \u9519\u8BEF\u6001 */
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

/* \u901A\u77E5\u6761\uFF08\u8868\u683C\u9876\u90E8\uFF09 */
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

/* \u9519\u8BEF\u6001\u5C45\u4E2D */
.dsh-dash-error-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  text-align: center;
}

/* \u54CD\u5E94\u5F0F */
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
}
`;
function injectStyles() {
  if (typeof document === "undefined") return () => {
  };
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing !== null) {
    existing.textContent = STYLE_TEXT;
    return () => {
    };
  }
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}
function syncTombstoneStyles(ids) {
  if (typeof document === "undefined") return;
  const css = ids.map((id) => `div[data-row-key="session:${id}"]{display:none!important}`).join("\n");
  const existing = document.getElementById(TOMBSTONE_STYLE_ELEMENT_ID);
  if (css === "") {
    existing?.remove();
    return;
  }
  if (existing !== null) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = document.createElement("style");
  style.id = TOMBSTONE_STYLE_ELEMENT_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
function removeTombstoneStyles() {
  if (typeof document === "undefined") return;
  document.getElementById(TOMBSTONE_STYLE_ELEMENT_ID)?.remove();
}

// src/client/RowCheckbox.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var CHECK_SVG = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 8.5l3.4 3.3 7-7.8"/></svg>';
function RowCheckbox({ sessionId, watchBatch, peekState, toggleSession, t }) {
  const anchorRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return void 0;
    const row = anchor.closest('[data-row-key^="session:"]');
    if (row === null) return void 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dsh-batch-check";
    button.setAttribute("role", "checkbox");
    button.setAttribute("data-dsh-batch-ui", "");
    button.innerHTML = CHECK_SVG;
    const sync = () => {
      const state = peekState();
      const selected = state.selected.includes(sessionId);
      button.classList.toggle("dsh-batch-check-on", selected);
      button.setAttribute("aria-checked", String(selected));
      button.setAttribute("aria-label", selected ? t("row.unselect") : t("row.select"));
      button.style.display = state.mode === "select" ? "" : "none";
      row.classList.toggle(ROW_SELECTED_CLASS, selected);
    };
    const onClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSession(sessionId);
    };
    const onMouseDown = (event) => {
      event.stopPropagation();
    };
    const onDragStart = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    button.addEventListener("click", onClick);
    button.addEventListener("mousedown", onMouseDown);
    button.addEventListener("dragstart", onDragStart);
    row.classList.add(BATCH_ROW_CLASS);
    row.insertBefore(button, row.firstChild);
    sync();
    const unsubscribe = watchBatch(sync);
    return () => {
      unsubscribe();
      button.removeEventListener("click", onClick);
      button.removeEventListener("mousedown", onMouseDown);
      button.removeEventListener("dragstart", onDragStart);
      button.remove();
      row.classList.remove(BATCH_ROW_CLASS);
      row.classList.remove(ROW_SELECTED_CLASS);
    };
  }, [sessionId, watchBatch, peekState, toggleSession, t]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { ref: anchorRef, style: { display: "none" }, "aria-hidden": true });
}

// src/client/FooterToggle.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime2 = require("react/jsx-runtime");
function FooterToggle({ wide, useBatch, enterSelect, exitSelect, t }) {
  const mode = useBatch((state) => state.mode);
  const count = useBatch((state) => state.selected.length);
  const active = mode === "select";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type: "button",
      "data-dsh-batch-ui": "",
      className: active ? "dsh-batch-footer dsh-batch-footer-on" : "dsh-batch-footer",
      "aria-pressed": active,
      title: t("footer.toggle"),
      "aria-label": t("footer.toggle"),
      onClick: () => {
        if (active) exitSelect();
        else enterSelect();
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.IconChecklistOutlineRegular, { size: 16 }),
        wide && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: t("footer.label") }),
        active && count > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-batch-badge", children: count })
      ]
    }
  );
}

// src/client/BatchOverlay.tsx
var import_react2 = require("react");
var import_react_dom = require("react-dom");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/DeleteDialog.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime3 = require("react/jsx-runtime");
var MAX_LISTED = 8;
function DeleteDialog({ ids, busy, titleOf, onCancel, onConfirm, t }) {
  const deleting = busy !== null;
  const listed = ids.slice(0, MAX_LISTED);
  const overflow = ids.length - listed.length;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    import_dsh_client_ui_primitives2.Modal,
    {
      open: true,
      onClose: () => {
        if (!deleting) onCancel();
      },
      closeLabel: t("delete.cancel"),
      title: t("delete.title", { n: ids.length }),
      description: t("delete.desc"),
      footer: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "outline", disabled: deleting, onClick: onCancel, children: t("delete.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_dsh_client_ui_primitives2.Button,
          {
            variant: "outline",
            className: "dsh-batch-danger-btn",
            disabled: deleting,
            onClick: () => {
              onConfirm(ids);
            },
            children: t("delete.confirm")
          }
        )
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { className: "dsh-batch-delete-list", children: [
          listed.map((id) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: titleOf(id) }, id)),
          overflow > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: t("delete.more", { n: overflow }) })
        ] }),
        busy !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-batch-delete-status", role: "status", children: [
          t("delete.pending"),
          " ",
          busy.done,
          "/",
          busy.total
        ] })
      ]
    }
  );
}

// src/client/BatchOverlay.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var ROW_KEY_PREFIX2 = "session:";
var NOTICE_HOLD_MS = 6e3;
var NOTICE_HOLD_FAILURES_MS = 15e3;
function BatchOverlay(props) {
  const {
    useBatch,
    useArchivedIds,
    t,
    peekState,
    exitSelect,
    toggleSession,
    selectAllVisible,
    clearSelection,
    runArchive,
    runUnarchive,
    requestDeleteConfirm,
    closeConfirm,
    runDelete,
    dismissNotice,
    titleOf
  } = props;
  const mode = useBatch((state) => state.mode);
  const selected = useBatch((state) => state.selected);
  const busy = useBatch((state) => state.busy);
  const confirmDelete = useBatch((state) => state.confirmDelete);
  const notice = useBatch((state) => state.notice);
  const tombstones = useBatch((state) => state.tombstones);
  const archivedIds = useArchivedIds((set) => set);
  (0, import_react2.useEffect)(() => injectStyles(), []);
  (0, import_react2.useEffect)(() => {
    syncTombstoneStyles(tombstones);
  }, [tombstones]);
  (0, import_react2.useEffect)(() => removeTombstoneStyles, []);
  (0, import_react2.useEffect)(() => {
    if (mode !== "select") return void 0;
    document.body.classList.add(BODY_MODE_CLASS);
    return () => {
      document.body.classList.remove(BODY_MODE_CLASS);
    };
  }, [mode]);
  (0, import_react2.useEffect)(() => {
    if (mode !== "select") return void 0;
    const inOwnUi = (target) => target instanceof Element && target.closest(OWN_UI_SELECTOR) !== null;
    const rowOf = (target) => {
      if (!(target instanceof Element)) return null;
      const row = target.closest(`[data-row-key^="${ROW_KEY_PREFIX2}"]`);
      if (row === null || !row.classList.contains(BATCH_ROW_CLASS)) return null;
      return row;
    };
    const idOf = (row) => (row.getAttribute("data-row-key") ?? "").slice(ROW_KEY_PREFIX2.length);
    const onClick = (event) => {
      if (inOwnUi(event.target)) return;
      const row = rowOf(event.target);
      if (row === null) return;
      event.preventDefault();
      event.stopPropagation();
      const id = idOf(row);
      if (id !== "") toggleSession(id);
    };
    const onDblClick = (event) => {
      if (inOwnUi(event.target) || rowOf(event.target) === null) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onDragStart = (event) => {
      if (rowOf(event.target) === null) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (peekState().confirmDelete === null) {
          event.preventDefault();
          event.stopPropagation();
          exitSelect();
        }
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      if (inOwnUi(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const row = rowOf(event.target);
      if (row === null) return;
      event.preventDefault();
      event.stopPropagation();
      const id = idOf(row);
      if (id !== "") toggleSession(id);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [mode, toggleSession, exitSelect, peekState]);
  (0, import_react2.useEffect)(() => {
    if (notice === null) return void 0;
    const hold = notice.failures === void 0 ? NOTICE_HOLD_MS : NOTICE_HOLD_FAILURES_MS;
    const timer = setTimeout(dismissNotice, hold);
    return () => {
      clearTimeout(timer);
    };
  }, [notice, dismissNotice]);
  const allArchived = selected.length > 0 && selected.every((id) => archivedIds.has(id));
  const noneSelected = selected.length === 0;
  const working = busy !== null;
  const showBar = mode === "select" || selected.length > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    showBar && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-batch-bar", "data-dsh-batch-ui": "", role: "toolbar", "aria-label": t("bar.aria"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-batch-count", children: t("bar.selected", { n: selected.length }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-batch-btn", disabled: working, onClick: selectAllVisible, children: t("bar.selectAll") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-batch-btn", disabled: working || noneSelected, onClick: clearSelection, children: t("bar.clear") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-batch-sep", "aria-hidden": true }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-batch-btn",
            disabled: working || noneSelected,
            onClick: () => {
              if (allArchived) runUnarchive(selected);
              else runArchive(selected);
            },
            children: [
              allArchived ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconUnarchiveOutlineRegular, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconArchiveOutlineRegular, { size: 14 }),
              allArchived ? t("bar.unarchive") : t("bar.archive")
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            className: "dsh-batch-btn dsh-batch-btn-danger",
            disabled: working || noneSelected,
            onClick: requestDeleteConfirm,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconTrashOutlineRegular, { size: 14 }),
              t("bar.delete")
            ]
          }
        ),
        mode === "select" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-batch-sep", "aria-hidden": true }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-batch-btn", disabled: working, onClick: exitSelect, children: t("bar.exit") })
        ] }),
        busy !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "dsh-batch-busy", role: "status", children: [
          t(busy.labelKey),
          " ",
          busy.done,
          "/",
          busy.total
        ] })
      ] }),
      document.body
    ),
    notice !== null && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(NoticePanel, { notice, t, onDismiss: dismissNotice }),
      document.body
    ),
    confirmDelete !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      DeleteDialog,
      {
        ids: confirmDelete,
        busy,
        titleOf,
        onCancel: closeConfirm,
        onConfirm: runDelete,
        t
      }
    )
  ] });
}
function NoticePanel({ notice, t, onDismiss }) {
  const reasonOf = (code, message) => {
    const key = `notice.code.${code}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return message ?? code;
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-batch-notice", "data-dsh-batch-ui": "", role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-batch-notice-head", children: [
      notice.kind === "error" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconWarningOutlineRegular, { size: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-batch-notice-text", children: t(notice.textKey, notice.params) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-batch-notice-close", "aria-label": t("notice.close"), onClick: onDismiss, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconCloseOutlineRegular, { size: 12 }) })
    ] }),
    notice.failures !== void 0 && notice.failures.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "dsh-batch-failures", children: notice.failures.map((failure, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { children: [
      failure.title !== "" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-batch-fail-title", children: failure.title }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-batch-fail-reason", children: reasonOf(failure.code, failure.message) })
    ] }, failure.id !== "" ? failure.id : `idx-${String(index)}`)) }),
    notice.action !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dsh-batch-notice-action", onClick: notice.action.run, children: t(notice.action.labelKey, notice.action.params) })
  ] });
}

// src/client/DashboardEntry.tsx
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime5 = require("react/jsx-runtime");
function DashboardEntry({ wide, open, onToggle, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "button",
    {
      type: "button",
      "data-dsh-batch-ui": "",
      className: open ? "dsh-batch-footer dsh-batch-footer-on" : "dsh-batch-footer",
      "aria-expanded": open,
      title: t("dash.entry"),
      "aria-label": t("dash.entry"),
      onClick: onToggle,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconGaugeOutlineRegular, { size: 16 }),
        wide && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: t("dash.entry") })
      ]
    }
  );
}

// src/client/DashboardPanel.tsx
var import_react3 = require("react");
var import_react_dom2 = require("react-dom");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/stats-client.ts
var FETCH_TIMEOUT_MS = 3e4;
function discoverPollInterval() {
  const injected = typeof window === "undefined" ? void 0 : window.__DSH_SESSION_BATCH_MANAGER__;
  const interval = injected?.statsPollIntervalMs;
  if (typeof interval === "number" && interval >= 1e3) return interval;
  return 5e3;
}
function discoverRouteBase2() {
  const injected = typeof window === "undefined" ? void 0 : window.__DSH_SESSION_BATCH_MANAGER__;
  const base = injected?.routeBase;
  if (typeof base === "string" && base.startsWith("/")) return base.replace(/\/+$/, "");
  return "/dsh-session-batch-manager/v1";
}
async function fetchStats(signal) {
  const routeBase = discoverRouteBase2();
  let response;
  try {
    response = await fetch(`${routeBase}/stats`, {
      signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "cache-control": "no-store" }
    });
  } catch {
    return { ok: false, complete: true, pending: 0, degraded: false, generatedAt: 0, sessions: [], code: "network" };
  }
  if (!response.ok) {
    return { ok: false, complete: true, pending: 0, degraded: false, generatedAt: 0, sessions: [], code: `http-${String(response.status)}` };
  }
  try {
    return await response.json();
  } catch {
    return { ok: false, complete: true, pending: 0, degraded: false, generatedAt: 0, sessions: [], code: "parse" };
  }
}
function createStatsPoller() {
  let intervalId = null;
  let callback = null;
  let stopped = false;
  const poll = () => {
    if (stopped || callback === null) return;
    void fetchStats().then(callback);
  };
  const onVisibilityChange = () => {
    if (document.hidden || callback === null) {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }
    if (intervalId === null && !stopped) {
      poll();
      intervalId = setInterval(poll, discoverPollInterval());
    }
  };
  return {
    get running() {
      return intervalId !== null;
    },
    start(onData) {
      callback = onData;
      stopped = false;
      if (!document.hidden && intervalId === null) {
        poll();
        intervalId = setInterval(poll, discoverPollInterval());
      }
      document.addEventListener("visibilitychange", onVisibilityChange);
    },
    stop() {
      stopped = true;
      callback = null;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

// src/client/DashboardPanel.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function useDashState(store, key) {
  return (0, import_react3.useSyncExternalStore)(
    store.source.subscribe,
    () => store.get()[key]
  );
}
function DashboardPanel({ open, onToggle, sessions, workspaces, t, sidebarOps, dashStore: dashStore2 }) {
  const store = dashStore2;
  const filter = useDashState(store, "filter");
  const selected = useDashState(store, "selected");
  const busy = useDashState(store, "busy");
  const confirmDelete = useDashState(store, "confirmDelete");
  const notice = useDashState(store, "notice");
  const [data, setData] = (0, import_react3.useState)(null);
  const [fetchError, setFetchError] = (0, import_react3.useState)(false);
  const [initialLoad, setInitialLoad] = (0, import_react3.useState)(true);
  const pollerRef = (0, import_react3.useRef)(createStatsPoller());
  const panelRef = (0, import_react3.useRef)(null);
  const titleOf = (0, import_react3.useCallback)((id) => {
    const row = sessions.list.getSnapshot().byId[id];
    const title = row?.displayTitle;
    return typeof title === "string" && title !== "" ? title : id;
  }, [sessions.list]);
  (0, import_react3.useEffect)(() => {
    if (!open) {
      pollerRef.current.stop();
      return;
    }
    const handleData = (res) => {
      setData(res);
      setInitialLoad(false);
      if (res.ok) setFetchError(false);
    };
    pollerRef.current.start(handleData);
    return () => {
      pollerRef.current.stop();
    };
  }, [open]);
  (0, import_react3.useEffect)(() => {
    if (!open) return;
    document.body.classList.add(BODY_DASHBOARD_CLASS);
    return () => {
      document.body.classList.remove(BODY_DASHBOARD_CLASS);
    };
  }, [open]);
  (0, import_react3.useEffect)(() => {
    if (!open) return void 0;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (store.get().confirmDelete !== null) return;
        if (store.get().busy !== null) return;
        e.preventDefault();
        e.stopPropagation();
        doClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onToggle, store]);
  const rows = (0, import_react3.useMemo)(() => {
    if (data === null || !data.ok) return [];
    const byId = sessions.list.getSnapshot().byId;
    const ws = workspaces.list.getSnapshot();
    const archived = new Set(ws.archivedSessionIds);
    const pinned = new Set(ws.pinnedSessionIds);
    const tombstones = new Set(sidebarOps.tombstones);
    return data.sessions.filter((s) => !tombstones.has(s.id)).map((s) => {
      const session = byId[s.id];
      return {
        id: s.id,
        title: session?.displayTitle ?? s.id,
        origin: session?.origin,
        running: session?.running ?? false,
        archived: archived.has(s.id),
        pinned: pinned.has(s.id),
        updatedAt: session?.updatedAt,
        stats: s
      };
    });
  }, [data, sessions.list, workspaces.list, sidebarOps.tombstones]);
  const filteredRows = (0, import_react3.useMemo)(() => {
    return rows.filter((row) => {
      if (filter === "all") return true;
      if (filter === "main") return row.origin !== "subagent" && !row.archived;
      if (filter === "subagent") return row.origin === "subagent" && !row.archived;
      if (filter === "archived") return row.archived;
      return true;
    });
  }, [rows, filter]);
  const counts = (0, import_react3.useMemo)(() => {
    const all = rows.length;
    const main = rows.filter((r) => r.origin !== "subagent" && !r.archived).length;
    const sub = rows.filter((r) => r.origin === "subagent" && !r.archived).length;
    const arch = rows.filter((r) => r.archived).length;
    return { all, main, sub, arch };
  }, [rows]);
  const allArchived = selected.length > 0 && selected.every((id) => {
    const row = rows.find((r) => r.id === id);
    return row?.archived ?? false;
  });
  const noneSelected = selected.length === 0;
  const working = busy !== null;
  const isDegraded = data !== null && data.ok && data.degraded;
  const doClose = (0, import_react3.useCallback)(() => {
    if (working) return;
    onToggle();
    store.clearSelection();
  }, [working, onToggle, store]);
  const doRefresh = (0, import_react3.useCallback)(() => {
    setFetchError(false);
    void fetchStats().then((res) => {
      setData(res);
      if (res.ok) setFetchError(false);
    });
  }, []);
  const doArchive = (0, import_react3.useCallback)(async () => {
    if (selected.length === 0) return;
    store.setBusy("bar.busyArchiving", 0, selected.length);
    const capActive = selected;
    const result = await runArchiveCore(capActive, workspaces, titleOf, false, {
      onProgress: () => store.advanceBusy()
    });
    store.clearBusy();
    store.clearSelection();
    void fetchStats().then(setData);
    const { ok, active, failures } = result;
    if (active.length === 0 && failures.length === 0) {
      store.showNotice({ kind: ok > 0 ? "success" : "info", textKey: ok > 0 ? "notice.archived" : "notice.noneArchived", params: { n: ok } });
    } else {
      store.showNotice({
        kind: "error",
        textKey: ok > 0 ? "notice.archived" : "notice.noneArchived",
        params: { n: ok },
        failures: [...active.map((id) => ({ id, title: titleOf(id), code: "active" })), ...failures],
        action: active.length > 0 ? {
          labelKey: "notice.stopAndArchive",
          params: { n: active.length },
          run: () => {
            void (async () => {
              store.dismissNotice();
              store.setBusy("bar.busyArchiving", 0, active.length);
              const retry = await runArchiveCore(active, workspaces, titleOf, true, {
                onProgress: () => store.advanceBusy()
              });
              store.clearBusy();
              void fetchStats().then(setData);
              const { ok: rOk, failures: rFail } = retry;
              store.showNotice({
                kind: rFail.length === 0 ? "success" : "error",
                textKey: rOk > 0 ? "notice.archived" : "notice.noneArchived",
                params: { n: rOk },
                failures: rFail
              });
            })();
          }
        } : void 0
      });
    }
  }, [selected, workspaces, titleOf, store]);
  const doUnarchive = (0, import_react3.useCallback)(async () => {
    if (selected.length === 0) return;
    store.setBusy("bar.busyUnarchiving", 0, selected.length);
    const capSelected = selected;
    const result = await runUnarchiveCore(capSelected, workspaces, titleOf, {
      onProgress: () => store.advanceBusy()
    });
    store.clearBusy();
    store.clearSelection();
    void fetchStats().then(setData);
    store.showNotice({
      kind: result.failures.length === 0 ? "success" : "error",
      textKey: result.ok > 0 ? "notice.unarchived" : "notice.noneUnarchived",
      params: { n: result.ok },
      failures: result.failures
    });
  }, [selected, workspaces, titleOf, store]);
  const doDelete = (0, import_react3.useCallback)(async (ids) => {
    if (ids.length === 0) return;
    store.closeConfirm();
    store.dismissNotice();
    store.setBusy("bar.busyDeleting", 0, ids.length);
    try {
      const result = await runDeleteCore(ids, discoverRouteBase3(), titleOf);
      if (result.okIds.length > 0) sidebarOps.addTombstones(result.okIds);
      store.clearSelection();
      try {
        await sidebarOps.refreshSessions();
      } catch {
      }
      store.clearBusy();
      void fetchStats().then(setData);
      store.showNotice({
        kind: result.failures.length === 0 ? "success" : "error",
        textKey: result.okIds.length > 0 ? "notice.deleted" : "notice.noneDeleted",
        params: { n: result.okIds.length },
        failures: result.failures
      });
    } catch (reason) {
      store.clearBusy();
      const code = reason instanceof DeleteRequestError ? reason.code : "internal";
      store.showNotice({
        kind: "error",
        textKey: "notice.noneDeleted",
        failures: [{ id: "", title: "", code, message: reason instanceof Error ? reason.message : String(reason) }]
      });
    }
  }, [titleOf, sidebarOps, store]);
  const selectAll = (0, import_react3.useCallback)(() => {
    store.selectAll(filteredRows.map((r) => r.id));
  }, [filteredRows, store]);
  const onFilter = (0, import_react3.useCallback)((f) => {
    store.setFilter(f);
  }, [store]);
  const toggleRow = (0, import_react3.useCallback)((id) => {
    store.toggleSelect(id);
  }, [store]);
  if (!open) return null;
  const pending = data?.pending ?? 0;
  const loaded = filteredRows.length;
  const totalEst = loaded + pending;
  const progressPercent = totalEst > 0 ? Math.round(loaded / totalEst * 100) : 0;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "div",
        {
          ref: panelRef,
          className: "dsh-dash-panel",
          "data-dsh-batch-ui": "",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": t("dash.panel.aria"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-header", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-header-left", children: t("dash.title") }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-header-right", children: pending > 0 ? t("dash.pending", { n: pending }) : data !== null ? t("dash.updatedAt", { time: new Date(data.generatedAt).toLocaleTimeString() }) : "" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-dash-close", disabled: working, "aria-label": t("dash.close"), onClick: doClose, "data-dsh-batch-ui": "", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconCloseOutlineRegular, { size: 14 }) })
            ] }),
            pending > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-progress-bar", role: "progressbar", "aria-valuenow": progressPercent, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": t("dash.progress.aria"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-progress-fill", style: { width: `${String(progressPercent)}%` } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-toolbar", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_dsh_client_ui_primitives5.Pill, { active: filter === "all", onClick: () => {
                onFilter("all");
              }, children: [
                t("dash.filter.all"),
                " ",
                counts.all
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_dsh_client_ui_primitives5.Pill, { active: filter === "main", onClick: () => {
                onFilter("main");
              }, children: [
                t("dash.filter.main"),
                " ",
                counts.main
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_dsh_client_ui_primitives5.Pill, { active: filter === "subagent", onClick: () => {
                onFilter("subagent");
              }, children: [
                t("dash.filter.subagent"),
                " ",
                counts.sub
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_dsh_client_ui_primitives5.Pill, { active: filter === "archived", onClick: () => {
                onFilter("archived");
              }, children: [
                t("dash.filter.archived"),
                " ",
                counts.arch
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-toolbar-right", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-batch-count", children: t("bar.selected", { n: selected.length }) }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-batch-btn", disabled: working, onClick: selectAll, children: t("bar.selectAll") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-batch-btn", disabled: working || noneSelected, onClick: () => {
                  store.clearSelection();
                }, children: t("bar.clear") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-batch-sep", "aria-hidden": true }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-batch-btn", disabled: working || noneSelected, onClick: () => {
                  allArchived ? void doUnarchive() : void doArchive();
                }, children: [
                  allArchived ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconUnarchiveOutlineRegular, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconArchiveOutlineRegular, { size: 14 }),
                  allArchived ? t("bar.unarchive") : t("bar.archive")
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "dsh-batch-btn dsh-batch-btn-danger", disabled: working || noneSelected, onClick: () => {
                  store.requestDeleteConfirm();
                }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconTrashOutlineRegular, { size: 14 }),
                  t("bar.delete")
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-batch-sep", "aria-hidden": true }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-batch-btn", disabled: working, onClick: doRefresh, children: t("dash.refresh") }),
                busy !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-batch-busy", role: "status", children: [
                  t(busy.labelKey),
                  " ",
                  busy.done,
                  "/",
                  busy.total
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-table-wrapper", children: [
              isDegraded && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-notice-bar", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconWarningOutlineRegular, { size: 14 }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: t("dash.degraded") })
              ] }),
              fetchError && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-notice-bar", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconWarningOutlineRegular, { size: 14 }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: t("dash.loadFailed") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-batch-btn", onClick: doRefresh, children: t("dash.retry") })
              ] }),
              initialLoad && (data === null || data.sessions.length === 0) ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "dsh-dash-table", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(DashboardTableHead, { t }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: Array.from({ length: 8 }, (_, i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { className: "dsh-dash-skeleton", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-skeleton-bar", style: { width: "18px" } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-skeleton-bar", style: { width: "60%" } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td dsh-dash-model-col", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-skeleton-bar", style: { width: "70%" } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td dsh-dash-td-right", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-skeleton-bar", style: { width: "40px", marginLeft: "auto" } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td dsh-dash-td-right", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-skeleton-bar", style: { width: "50px", marginLeft: "auto" } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-skeleton-bar dsh-dash-ctx-bar", style: { width: "100px" } }) })
                ] }, `skel-${String(i)}`)) })
              ] }) : data === null || data.sessions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-empty", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-empty-title", children: t("dash.empty.title") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-empty-desc", children: t("dash.empty.desc") })
              ] }) : filteredRows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-empty", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-empty-title", children: t("dash.emptyFiltered.title") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-batch-notice-action", onClick: () => {
                  onFilter("all");
                }, children: t("dash.emptyFiltered.clear") })
              ] }) : data === null || !data.ok ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-error-center", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconWarningOutlineRegular, { size: 24 }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: t("dash.loadFailed") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", onClick: doRefresh, children: t("dash.retry") })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "dsh-dash-table", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("caption", { children: t("dash.table.caption") }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(DashboardTableHead, { t }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: filteredRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  DashboardRowView,
                  {
                    row,
                    selected: selected.includes(row.id),
                    onToggle: () => {
                      toggleRow(row.id);
                    },
                    t
                  },
                  row.id
                )) })
              ] })
            ] })
          ]
        }
      ),
      document.body
    ),
    confirmDelete !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      import_dsh_client_ui_primitives5.Modal,
      {
        open: true,
        closeLabel: t("delete.cancel"),
        onClose: () => {
          if (!working) store.closeConfirm();
        },
        title: t("delete.title", { n: confirmDelete.length }),
        description: t("delete.desc"),
        footer: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", disabled: working, onClick: () => {
            store.closeConfirm();
          }, children: t("delete.cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", className: "dsh-batch-danger-btn", disabled: working, onClick: () => {
            void doDelete(confirmDelete);
          }, children: t("delete.confirm") })
        ] }),
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("ul", { className: "dsh-batch-delete-list", children: [
          confirmDelete.slice(0, 8).map((id) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("li", { children: titleOf(id) }, id)),
          confirmDelete.length > 8 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("li", { children: t("delete.more", { n: confirmDelete.length - 8 }) })
        ] })
      }
    ),
    notice !== null && (0, import_react_dom2.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NoticePanel2, { notice, t, onDismiss: () => {
        store.dismissNotice();
      } }),
      document.body
    )
  ] });
}
function DashboardTableHead({ t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("colgroup", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("col", { style: { width: "40px" } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("col", { style: { minWidth: "200px" } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("col", { className: "dsh-dash-model-col", style: { width: "180px" } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("col", { style: { width: "100px" } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("col", { style: { width: "120px" } }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("col", { style: { width: "240px" } })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { className: "dsh-dash-th", scope: "col", "aria-label": t("dash.selectAll.aria", { n: 0 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { className: "dsh-dash-th", scope: "col", children: t("dash.col.session") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { className: "dsh-dash-th dsh-dash-model-col", scope: "col", children: t("dash.col.model") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { className: "dsh-dash-th dsh-dash-th-right", scope: "col", children: t("dash.col.tokens") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { className: "dsh-dash-th dsh-dash-th-right", scope: "col", children: t("dash.col.cache") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { className: "dsh-dash-th", scope: "col", children: t("dash.col.context") })
    ] }) })
  ] });
}
function DashboardRowView({ row, selected, onToggle, t }) {
  const stats = row.stats;
  const hasError = stats.error !== null;
  const tokenTotal = stats.usage !== null ? stats.usage.uncachedInputTokens + stats.usage.outputTokens + stats.usage.cacheReadTokens + stats.usage.cacheWriteTokens : null;
  const ctxUsed = stats.pressure?.projectedTokens ?? stats.pressure?.pressureTokens;
  const ctxWindow = stats.pressure?.contextWindow;
  const ctxPercent = ctxUsed !== void 0 && ctxWindow !== void 0 && ctxWindow > 0 ? Math.min(100, Math.round(ctxUsed / ctxWindow * 100)) : null;
  const ctxWarn = ctxPercent !== null && ctxPercent >= 90;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { className: selected ? "dsh-dash-row dsh-dash-row-selected" : "dsh-dash-row", onClick: onToggle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td", onClick: (e) => {
      e.stopPropagation();
    }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { type: "checkbox", className: "dsh-dash-check", checked: selected, onChange: onToggle, "aria-label": t("dash.row.select.aria", { title: row.title }), "data-dsh-batch-ui": "" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("td", { className: "dsh-dash-td", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-dash-session-cell", children: [
        row.running && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.StateDot, { state: "ongoing" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-session-title", children: row.title }),
        row.origin === "subagent" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tag, { tone: "info", children: t("dash.badge.subagent") }),
        row.archived && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tag, { tone: "neutral", children: t("dash.badge.archived") }),
        row.pinned && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tag, { tone: "quiet", children: t("dash.badge.pinned") }),
        hasError && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip, { portal: true, label: stats.error === "corrupt" ? t("dash.error.corrupt") : t("dash.error.read-failed"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconWarningOutlineRegular, { size: 12 }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-dash-session-model-sub", children: stats.model ?? "\u2014" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td dsh-dash-model-col", children: hasError ? "\u2014" : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip, { portal: true, label: stats.model ?? "", onlyWhenClipped: true, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-session-subtitle", children: stats.model ?? "\u2014" }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td dsh-dash-td-right", children: hasError || tokenTotal === null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { "aria-hidden": "true", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip, { portal: true, openOnClick: true, label: `${t("dash.tip.input")}: ${formatNum(stats.usage.uncachedInputTokens)}
${t("dash.tip.output")}: ${formatNum(stats.usage.outputTokens)}
${t("dash.tip.cacheRead")}: ${formatNum(stats.usage.cacheReadTokens)}
${t("dash.tip.cacheWrite")}: ${formatNum(stats.usage.cacheWriteTokens)}
${t("dash.tip.usageNote")}`, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { onClick: (e) => {
      e.stopPropagation();
    }, children: compactNum(tokenTotal) }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td dsh-dash-td-right", children: hasError || stats.usage === null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { "aria-hidden": "true", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip, { portal: true, openOnClick: true, label: `${t("dash.tip.cacheRead")}: ${formatNum(stats.usage.cacheReadTokens)}
${t("dash.tip.cacheWrite")}: ${formatNum(stats.usage.cacheWriteTokens)}`, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { onClick: (e) => {
      e.stopPropagation();
    }, children: [
      compactNum(stats.usage.cacheReadTokens),
      " / ",
      compactNum(stats.usage.cacheWriteTokens)
    ] }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "dsh-dash-td", children: hasError || ctxPercent === null || ctxWindow === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { "aria-hidden": "true", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.Tooltip, { portal: true, openOnClick: true, label: t("dash.tip.context", { used: compactNum(ctxUsed ?? 0), window: compactNum(ctxWindow), percent: String(ctxPercent) }) + "\n" + t("dash.tip.contextNote"), children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-dash-ctx-bar", onClick: (e) => {
      e.stopPropagation();
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-dash-ctx-track", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ctxWarn ? "dsh-dash-ctx-fill dsh-dash-ctx-fill-warn" : "dsh-dash-ctx-fill", style: { width: `${String(ctxPercent)}%` } }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: ctxWarn ? "dsh-dash-ctx-percent dsh-dash-ctx-percent-warn" : "dsh-dash-ctx-percent", children: [
        ctxPercent,
        "%"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-dash-ctx-detail", children: [
        "~",
        compactNum(ctxUsed ?? 0),
        " / ",
        compactNum(ctxWindow)
      ] })
    ] }) }) })
  ] });
}
function NoticePanel2({ notice, t, onDismiss }) {
  (0, import_react3.useEffect)(() => {
    const delay = notice.kind === "error" ? 15e3 : 6e3;
    const timer = setTimeout(onDismiss, delay);
    return () => clearTimeout(timer);
  }, [notice.seq, notice.kind, onDismiss]);
  const failureLabel = (failure) => {
    const dictKey = `notice.code.${failure.code}`;
    const dictText = t(dictKey);
    if (dictText === dictKey) return failure.message ?? failure.code;
    return failure.message !== void 0 && failure.message !== "" ? `${dictText}: ${failure.message}` : dictText;
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-batch-notice", "data-dsh-batch-ui": "", role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-batch-notice-head", children: [
      notice.kind === "error" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconWarningOutlineRegular, { size: 14 }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-batch-notice-text", children: t(notice.textKey, notice.params) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-batch-notice-close", "aria-label": t("notice.close"), onClick: onDismiss, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives5.IconCloseOutlineRegular, { size: 12 }) })
    ] }),
    notice.failures !== void 0 && notice.failures.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "dsh-batch-failures", children: notice.failures.map((failure, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { children: [
      failure.title !== "" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-batch-fail-title", children: failure.title }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-batch-fail-reason", children: failureLabel(failure) })
    ] }, failure.id !== "" ? failure.id : `idx-${String(index)}`)) }),
    notice.action !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "dsh-batch-notice-action", onClick: () => {
      notice.action.run();
    }, children: t(notice.action.labelKey, notice.action.params) })
  ] });
}
function compactNum(n) {
  if (n < 1e3) return String(n);
  if (n < 1e6) {
    const v2 = n / 1e3;
    return v2 >= 100 ? String(Math.round(v2)) + "k" : String(Math.round(v2 * 10) / 10) + "k";
  }
  const v = n / 1e6;
  return v >= 100 ? String(Math.round(v)) + "M" : String(Math.round(v * 10) / 10) + "M";
}
function formatNum(n) {
  return new Intl.NumberFormat().format(n);
}
function discoverRouteBase3() {
  const injected = typeof window === "undefined" ? void 0 : window.__DSH_SESSION_BATCH_MANAGER__;
  const base = injected?.routeBase;
  if (typeof base === "string" && base.startsWith("/")) return base.replace(/\/+$/, "");
  return "/dsh-session-batch-manager/v1";
}

// src/client/index.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var inject = ["slots", "sessions", "workspaces", "locale"];
var dashStore = (0, import_dsh_client_store3.createSnapshotStore)({ open: false });
function apply(ctx) {
  const slots = ctx.get("slots");
  const sessions = ctx.get("sessions");
  const workspaces = ctx.get("workspaces");
  const locale = ctx.get("locale");
  ctx.effect(() => locale.register(NS, { zh, en }), "session-batch: dictionaries");
  const t = locale.bind(NS);
  const store = createBatchStore();
  const ops = createBatchOps(sessions, workspaces, store);
  dashStore = (0, import_dsh_client_store3.createSnapshotStore)({ open: false });
  const dashboardStore = createDashboardStore();
  const face = () => {
    const { archivedIdsSource, routeBase: _routeBase, ...callbacks } = ops;
    return {
      hooks: { batch: store.source, archivedIds: archivedIdsSource },
      ...callbacks
    };
  };
  slots.inject("sidebar.workspaces.session.row.action", () => slots.register({
    name: "sidebar.workspaces.session.row.action",
    id: "batch-select",
    order: 50,
    locale: NS,
    inject: face
  }, RowCheckbox));
  slots.inject("sidebar.footer.action", () => slots.register({
    name: "sidebar.footer.action",
    id: "batch-toggle",
    order: 50,
    locale: NS,
    inject: face
  }, FooterToggle));
  const dashEntryFace = () => ({
    dashOpen: dashStore
  });
  slots.inject("sidebar.footer.action", () => slots.register({
    name: "sidebar.footer.action",
    id: "batch-dashboard",
    order: 60,
    locale: NS,
    inject: dashEntryFace
  }, DashboardEntrySlot));
  slots.inject("shell.overlay", () => slots.register({
    name: "shell.overlay",
    id: "session-batch",
    locale: NS,
    inject: face
  }, BatchOverlay));
  const dashPanelFace = () => ({
    sessions,
    workspaces,
    t,
    tombstoneSource: store.source,
    addTombstones: (ids) => {
      store.addTombstones(ids);
    },
    refreshSessions: () => sessions.refresh(),
    dashOpen: dashStore,
    dashboardStore
  });
  slots.inject("shell.overlay", () => slots.register({
    name: "shell.overlay",
    id: "session-batch.dashboard",
    locale: NS,
    inject: dashPanelFace
  }, DashboardPanelSlot));
}
function DashboardEntrySlot(props) {
  const { wide, t, dashOpen } = props;
  const open = (0, import_react4.useSyncExternalStore)(dashOpen.subscribe, () => dashOpen.getSnapshot().open);
  const toggle = () => {
    dashOpen.set({ open: !dashOpen.getSnapshot().open });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(DashboardEntry, { wide, open, onToggle: toggle, t });
}
function DashboardPanelSlot(props) {
  const { sessions, workspaces, t, tombstoneSource, addTombstones, refreshSessions, dashOpen, dashboardStore } = props;
  const open = (0, import_react4.useSyncExternalStore)(dashOpen.subscribe, () => dashOpen.getSnapshot().open);
  const toggle = () => {
    dashOpen.set({ open: !dashOpen.getSnapshot().open });
  };
  const tombstones = (0, import_react4.useSyncExternalStore)(
    tombstoneSource.subscribe,
    () => tombstoneSource.getSnapshot().tombstones
  );
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
    DashboardPanel,
    {
      open,
      onToggle: toggle,
      sessions,
      workspaces,
      t,
      sidebarOps: { tombstones, addTombstones, refreshSessions },
      dashStore: dashboardStore
    }
  );
}

return module.exports; } });
//# sourceMappingURL=client.js.map
