"use client";

import { useSyncExternalStore } from "react";
import type { FactorSetId } from "@temt/calculator";
import { compute, type ComputedShipment, type ShipmentRecord } from "./records";
import { uid } from "./format";

export interface Settings {
  organisation: { name: string; symbol?: string; industry?: string; revenueCrore?: number; contact?: string };
  factorSet: FactorSetId;
  businessUnits: string[];
  target: { baseYear: string; targetYear: string; reductionPercent: number };
  carbonPriceInrPerTonne: number;
  units: "auto" | "t" | "kg";
  onboarded: boolean;
  copilot: { engine: "builtin" | "local-llm"; endpoint: string; model: string };
}

export interface ActivityEntry {
  id: string;
  at: string;
  action: string;
  detail: string;
}

export interface State {
  hydrated: boolean;
  storage: "indexeddb" | "localstorage" | "memory";
  shipments: ShipmentRecord[];
  settings: Settings;
  activity: ActivityEntry[];
}

export const DEFAULT_SETTINGS: Settings = {
  organisation: { name: "" },
  factorSet: "glec-india",
  businessUnits: ["Operations"],
  target: { baseYear: "FY 2024–25", targetYear: "FY 2030–31", reductionPercent: 30 },
  carbonPriceInrPerTonne: 0,
  units: "auto",
  onboarded: false,
  copilot: { engine: "builtin", endpoint: "http://localhost:11434/v1", model: "qwen2.5:3b" },
};

const INITIAL: State = { hydrated: false, storage: "memory", shipments: [], settings: DEFAULT_SETTINGS, activity: [] };
let state: State = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

export function useStore<T>(selector: (state: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(INITIAL));
}

// ─── Persistence: IndexedDB with a localStorage fallback ───────────────────

const DB_NAME = "temt-workspace";
const STORE = "kv";
const LS_PREFIX = "temt:";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function lsGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked; the in-memory workspace still works for this session.
  }
}

function lsRemove(key: string) {
  try { localStorage.removeItem(LS_PREFIX + key); } catch { /* storage blocked */ }
}

let hydrating: Promise<void> | undefined;
export function hydrate() {
  if (typeof window === "undefined") return Promise.resolve();
  hydrating ??= (async () => {
    let storage: State["storage"] = "indexeddb";
    let shipments: ShipmentRecord[] | undefined;
    let settings: Partial<Settings> | undefined;
    let activity: ActivityEntry[] | undefined;
    try {
      [shipments, settings, activity] = await Promise.all([idbGet<ShipmentRecord[]>("shipments"), idbGet<Settings>("settings"), idbGet<ActivityEntry[]>("activity")]);
    } catch {
      storage = "localstorage";
      shipments = lsGet("shipments");
      settings = lsGet("settings");
      activity = lsGet("activity");
    }
    // A journal means the last session closed before its final save finished: it holds the newest state.
    const journal = lsGet<{ shipments: ShipmentRecord[]; settings: Settings; activity: ActivityEntry[] }>("journal");
    if (journal && Array.isArray(journal.shipments)) ({ shipments, settings, activity } = journal);
    state = {
      hydrated: true,
      storage,
      shipments: Array.isArray(shipments) ? shipments : [],
      settings: { ...DEFAULT_SETTINGS, ...settings, organisation: { ...DEFAULT_SETTINGS.organisation, ...settings?.organisation }, target: { ...DEFAULT_SETTINGS.target, ...settings?.target }, copilot: { ...DEFAULT_SETTINGS.copilot, ...settings?.copilot } },
      activity: Array.isArray(activity) ? activity : [],
    };
    emit();
    if (journal) void save();
  })();
  return hydrating;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingSave = false;
let flushRegistered = false;
function persist() {
  if (typeof window === "undefined" || !state.hydrated) return;
  clearTimeout(saveTimer);
  pendingSave = true;
  // Save straight away if the tab is hidden, reloaded or closed before the short batching delay ends.
  if (!flushRegistered) {
    flushRegistered = true;
    const flush = () => {
      if (!pendingSave) return;
      clearTimeout(saveTimer);
      // IndexedDB writes can be cut off while a page unloads; a synchronous journal survives and is replayed on load.
      lsSet("journal", { shipments: state.shipments, settings: state.settings, activity: state.activity });
      void save();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  }
  saveTimer = setTimeout(() => void save(), 250);
}

async function save() {
  pendingSave = false;
  const snapshot = state;
  if (snapshot.storage === "indexeddb") {
    try {
      await Promise.all([idbSet("shipments", snapshot.shipments), idbSet("settings", snapshot.settings), idbSet("activity", snapshot.activity)]);
      if (!pendingSave) lsRemove("journal");
      return;
    } catch {
      state = { ...state, storage: "localstorage" };
      emit();
    }
  }
  lsSet("shipments", snapshot.shipments);
  lsSet("settings", snapshot.settings);
  lsSet("activity", snapshot.activity);
  if (!pendingSave) lsRemove("journal");
}

function set(patch: Partial<State>, log?: { action: string; detail: string }) {
  const activity = log ? [{ id: uid("a"), at: new Date().toISOString(), ...log }, ...state.activity].slice(0, 500) : state.activity;
  state = { ...state, ...patch, activity };
  emit();
  persist();
}

// ─── Actions ───────────────────────────────────────────────────────────────

export const actions = {
  addShipments(records: ShipmentRecord[], detail?: string) {
    if (!records.length) return;
    set({ shipments: [...records, ...state.shipments] }, { action: records.length === 1 ? "Shipment added" : "Shipments imported", detail: detail ?? (records.length === 1 ? `${records[0]!.ref}: ${records[0]!.origin.label} → ${records[0]!.destination.label}` : `${records.length} shipments`) });
  },
  updateShipment(id: string, patch: Partial<ShipmentRecord>) {
    const target = state.shipments.find((item) => item.id === id);
    if (!target) return;
    set({ shipments: state.shipments.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)) }, { action: "Shipment edited", detail: target.ref });
  },
  removeShipments(ids: string[]) {
    const remove = new Set(ids);
    const removed = state.shipments.filter((item) => remove.has(item.id));
    if (!removed.length) return [];
    set({ shipments: state.shipments.filter((item) => !remove.has(item.id)) }, { action: removed.length === 1 ? "Shipment deleted" : "Shipments deleted", detail: removed.length === 1 ? removed[0]!.ref : `${removed.length} shipments` });
    return removed;
  },
  restoreShipments(records: ShipmentRecord[]) {
    const existing = new Set(state.shipments.map((item) => item.id));
    set({ shipments: [...records.filter((item) => !existing.has(item.id)), ...state.shipments] }, { action: "Deletion undone", detail: `${records.length} restored` });
  },
  replaceAll(records: ShipmentRecord[], detail: string) {
    set({ shipments: records }, { action: "Workspace replaced", detail });
  },
  clearShipments() {
    set({ shipments: [] }, { action: "Workspace cleared", detail: "All shipments removed from this browser" });
  },
  updateSettings(patch: Partial<Settings>, detail?: string) {
    const next = { ...state.settings, ...patch };
    const factorChanged = patch.factorSet && patch.factorSet !== state.settings.factorSet;
    set({ settings: next }, detail || factorChanged ? { action: factorChanged ? "Factor set changed" : "Settings updated", detail: detail ?? `Now using ${patch.factorSet}` } : undefined);
  },
  log(action: string, detail: string) {
    set({}, { action, detail });
  },
};

// ─── Derived selectors (memoised so React sees stable references) ──────────

let memo: { shipments?: ShipmentRecord[]; set?: FactorSetId; value: ComputedShipment[] } = { value: [] };
export function selectComputed(current: State): ComputedShipment[] {
  if (memo.shipments !== current.shipments || memo.set !== current.settings.factorSet) {
    memo = { shipments: current.shipments, set: current.settings.factorSet, value: current.shipments.map((record) => compute(record, current.settings.factorSet)) };
  }
  return memo.value;
}

export function useComputed() {
  return useStore(selectComputed);
}

export function useSettings() {
  return useStore((current) => current.settings);
}

// ─── Account sync ──────────────────────────────────────────────────────────

/** The part of the workspace that syncs to a signed-in account. */
export function workspaceSnapshot() {
  return { settings: state.settings, shipments: state.shipments };
}

/** Replace this browser's workspace with the copy from the account. */
export function applyRemoteWorkspace(data: { settings?: Partial<Settings>; shipments?: unknown }, detail: string) {
  const shipments = (Array.isArray(data.shipments) ? data.shipments : []).filter((item): item is ShipmentRecord => !!item && typeof item === "object" && "id" in item && "input" in item && "origin" in item);
  const remote = data.settings ?? {};
  const settings: Settings = { ...DEFAULT_SETTINGS, ...remote, organisation: { ...DEFAULT_SETTINGS.organisation, ...remote.organisation }, target: { ...DEFAULT_SETTINGS.target, ...remote.target }, copilot: { ...DEFAULT_SETTINGS.copilot, ...remote.copilot } };
  set({ shipments, settings }, { action: "Synced from account", detail });
  return shipments.length;
}

// ─── Backup and restore ────────────────────────────────────────────────────

export const BACKUP_VERSION = 1;
export function backupPayload() {
  return { app: "TEMT", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: state.settings, shipments: state.shipments };
}

export function restoreBackup(payload: unknown): { ok: true; count: number } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") return { ok: false, error: "The file is not a TEMT workspace backup." };
  const data = payload as { app?: string; shipments?: unknown; settings?: Partial<Settings> };
  if (data.app !== "TEMT" || !Array.isArray(data.shipments)) return { ok: false, error: "The file is not a TEMT workspace backup." };
  const shipments = data.shipments.filter((item): item is ShipmentRecord => !!item && typeof item === "object" && "id" in item && "input" in item && "origin" in item);
  set({ shipments, settings: { ...state.settings, ...data.settings } }, { action: "Backup restored", detail: `${shipments.length} shipments` });
  return { ok: true, count: shipments.length };
}
