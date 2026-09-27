"use client";

import { useSyncExternalStore } from "react";
import type { ReportModel } from "./report-model";
import type { ExportFormat } from "./exports/common";
import { applyRemoteWorkspace, getState, hydrate, subscribe as subscribeWorkspace, workspaceSnapshot } from "./store";
import type { ShipmentRecord } from "./records";

/**
 * Optional TEMT account: sign-in, cloud copy of the workspace and report history.
 * Production builds always call /api on the site's own origin (the host proxies it to the API), which keeps the
 * session cookie first-party. Only `next dev` uses NEXT_PUBLIC_API_BASE_URL to reach the API on another port.
 */
export const API_BASE = process.env.NODE_ENV === "development" ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "") : "";
const API = API_BASE;

export interface User { id: string; email: string; name: string; organisation: string; jobTitle: string; createdAt: string }
export interface Storage { mode: "postgres" | "embedded-local" | "embedded-ephemeral"; persistent: boolean }
export type SyncStatus = "idle" | "syncing" | "synced" | "conflict" | "offline" | "error";
export interface Conflict { version: number; updatedAt?: string; device?: string; shipments?: number }

export interface AccountState {
  status: "loading" | "signed-out" | "signed-in" | "unavailable";
  user?: User;
  storage?: Storage;
  sync: { status: SyncStatus; version: number; at?: string; message?: string; conflict?: Conflict };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) { super(message); }
}

let state: AccountState = { status: "loading", sync: { status: "idle", version: 0 } };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const setState = (patch: Partial<AccountState>) => { state = { ...state, ...patch }; emit(); };
const setSync = (patch: Partial<AccountState["sync"]>) => setState({ sync: { ...state.sync, ...patch } });

export const getAccount = () => state;
export function useAccount<T>(selector: (value: AccountState) => T): T {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => selector(state), () => selector({ status: "loading", sync: { status: "idle", version: 0 } }));
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${API}/api${path}`, {
      credentials: API ? "include" : "same-origin",
      ...rest,
      headers: { "X-TEMT-Client": "web", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "offline", "TEMT's server could not be reached. Your workspace is still saved in this browser.");
  }
  const body = await response.json().catch(() => ({})) as { error?: { code: string; message: string } & Record<string, unknown> } & T;
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? "error", body.error?.message ?? "Something went wrong.", body.error ?? {});
  return body;
}

// ─── Sync bookkeeping (per user, per browser) ─────────────────────────────

interface SyncMeta { version: number; hash: string; at: string }
const metaKey = (userId: string) => `temt.sync.${userId}`;
function readMeta(userId: string): SyncMeta | undefined {
  try { return JSON.parse(localStorage.getItem(metaKey(userId)) ?? "null") ?? undefined; } catch { return undefined; }
}
function writeMeta(userId: string, meta: SyncMeta | undefined) {
  try { if (meta) localStorage.setItem(metaKey(userId), JSON.stringify(meta)); else localStorage.removeItem(metaKey(userId)); } catch { /* storage blocked: sync still works for this session */ }
}

/** FNV-1a over the synced part of the workspace, to tell whether this browser changed since the last sync. */
function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return `${(hash >>> 0).toString(16)}-${text.length}`;
}

async function encode(payload: unknown): Promise<{ body: BodyInit; type: string }> {
  const text = JSON.stringify(payload);
  if (typeof CompressionStream === "undefined") return { body: text, type: "application/json" };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return { body: await new Response(stream).blob(), type: "application/gzip" };
}

let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushing: Promise<void> | undefined;

async function push(base: number) {
  const user = state.user;
  if (!user) return;
  const snapshot = workspaceSnapshot();
  const hash = fingerprint(snapshot);
  setSync({ status: "syncing", message: undefined });
  try {
    const { body, type } = await encode({ app: "TEMT", version: 1, exportedAt: new Date().toISOString(), ...snapshot });
    const result = await api<{ version: number; updatedAt: string }>("/workspace", { method: "PUT", body, headers: { "Content-Type": type, "X-TEMT-Base-Version": String(base) } });
    writeMeta(user.id, { version: result.version, hash, at: result.updatedAt });
    setSync({ status: "synced", version: result.version, at: result.updatedAt, conflict: undefined });
    // Changes made while uploading go up on the next pass.
    if (fingerprint(workspaceSnapshot()) !== hash) schedulePush();
  } catch (error) {
    if (error instanceof ApiError && error.code === "version_conflict") {
      setSync({ status: "conflict", conflict: { version: Number(error.details.version) || 0, updatedAt: error.details.updatedAt as string | undefined, device: error.details.device as string | undefined } });
    } else setSync({ status: error instanceof ApiError && error.status === 0 ? "offline" : "error", message: error instanceof Error ? error.message : "Sync failed." });
  }
}

function schedulePush(delay = 1800) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const user = state.user;
    if (!user || state.sync.status === "conflict" || applyingRemote) return;
    const meta = readMeta(user.id);
    if (meta && meta.hash === fingerprint(workspaceSnapshot())) return;
    pushing = (pushing ?? Promise.resolve()).then(() => push(meta?.version ?? state.sync.version));
  }, delay);
}

function applyRemote(userId: string, data: unknown, version: number, at: string | undefined, detail: string) {
  applyingRemote = true;
  try { applyRemoteWorkspace(data as { settings?: never; shipments?: unknown }, detail); } finally { applyingRemote = false; }
  writeMeta(userId, { version, hash: fingerprint(workspaceSnapshot()), at: at ?? new Date().toISOString() });
  setSync({ status: "synced", version, at, conflict: undefined });
}

/** Reconcile this browser with the account after sign-in or on load. */
export async function reconcile() {
  const user = state.user;
  if (!user) return;
  setSync({ status: "syncing", message: undefined });
  let remote: { version: number; updatedAt?: string; device?: string; shipments?: number; data: { settings?: unknown; shipments?: unknown[] } | null };
  try { remote = await api("/workspace"); } catch (error) {
    setSync({ status: error instanceof ApiError && error.status === 0 ? "offline" : "error", message: error instanceof Error ? error.message : "Sync failed." });
    return;
  }
  const local = workspaceSnapshot();
  const meta = readMeta(user.id);
  const localHash = fingerprint(local);
  const onlySamples = local.shipments.every((row) => row.source === "sample");
  if (remote.version === 0 || !remote.data) {
    if (local.shipments.length) await push(0);
    else setSync({ status: "synced", version: 0, at: undefined });
    return;
  }
  if (meta?.version === remote.version) {
    if (meta.hash !== localHash) await push(remote.version);
    else setSync({ status: "synced", version: remote.version, at: remote.updatedAt });
    return;
  }
  // The account has a newer copy. Take it when this browser has nothing of its own to lose.
  if (!local.shipments.length || onlySamples || meta?.hash === localHash) {
    applyRemote(user.id, remote.data, remote.version, remote.updatedAt, `${remote.data.shipments?.length ?? 0} shipments, version ${remote.version}`);
    return;
  }
  setSync({ status: "conflict", conflict: { version: remote.version, updatedAt: remote.updatedAt, device: remote.device, shipments: remote.shipments } });
}

/** Resolve a conflict: keep the account copy, keep this browser's copy, or combine both by shipment. */
export async function resolveConflict(choice: "account" | "device" | "merge") {
  const user = state.user;
  if (!user) return;
  const conflict = state.sync.conflict;
  setSync({ status: "syncing" });
  let remote: { version: number; updatedAt?: string; data: { settings?: unknown; shipments?: ShipmentRecord[] } | null };
  try { remote = await api("/workspace"); } catch (error) {
    // Stay in the conflict state so the choice can be made again.
    setSync({ status: "conflict", conflict, message: error instanceof Error ? error.message : "Sync failed." });
    return;
  }
  if (choice === "account" && remote.data) return applyRemote(user.id, remote.data, remote.version, remote.updatedAt, "Kept the account copy");
  if (choice === "merge" && remote.data) {
    const byId = new Map<string, ShipmentRecord>();
    for (const row of [...(remote.data.shipments ?? []), ...getState().shipments]) {
      const existing = byId.get(row.id);
      if (!existing || (row.updatedAt ?? "") > (existing.updatedAt ?? "")) byId.set(row.id, row);
    }
    applyingRemote = true;
    try { applyRemoteWorkspace({ settings: getState().settings, shipments: [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)) }, `Merged this browser with the account (${byId.size} shipments)`); } finally { applyingRemote = false; }
  }
  await push(remote.version);
}

export function retrySync() {
  if (state.sync.status === "conflict") return;
  void reconcile();
}

// ─── Session ───────────────────────────────────────────────────────────────

let loading: Promise<void> | undefined;
let watching = false;
export function loadAccount() {
  loading ??= (async () => {
    // Compare against this browser's saved workspace, never a half-loaded one.
    await hydrate();
    try {
      const me = await api<{ user: User | null; storage: Storage }>("/auth/me");
      setState({ status: me.user ? "signed-in" : "signed-out", user: me.user ?? undefined, storage: me.storage });
      if (me.user) await reconcile();
    } catch {
      setState({ status: "unavailable" });
    }
    if (!watching) {
      watching = true;
      subscribeWorkspace(() => { if (state.status === "signed-in" && !applyingRemote) schedulePush(); });
    }
  })();
  return loading;
}

async function signedIn(user: User) {
  const me = await api<{ storage: Storage }>("/auth/me").catch(() => undefined);
  setState({ status: "signed-in", user, storage: me?.storage ?? state.storage, sync: { status: "idle", version: 0 } });
  await reconcile();
}

export async function signUp(input: { name: string; email: string; password: string; organisation?: string; jobTitle?: string }) {
  const { user } = await api<{ user: User }>("/auth/signup", { method: "POST", json: input });
  await signedIn(user);
}

export async function signIn(input: { email: string; password: string }) {
  const { user } = await api<{ user: User }>("/auth/signin", { method: "POST", json: input });
  await signedIn(user);
}

export async function signOut() {
  clearTimeout(pushTimer);
  await api("/auth/signout", { method: "POST" }).catch(() => undefined);
  setState({ status: "signed-out", user: undefined, sync: { status: "idle", version: 0 } });
}

export async function updateProfile(patch: Partial<Pick<User, "name" | "organisation" | "jobTitle">>) {
  const { user } = await api<{ user: User }>("/account", { method: "PATCH", json: patch });
  setState({ user });
}

export const changePassword = (current: string, next: string) => api("/account/password", { method: "POST", json: { current, next } });

export async function deleteAccount(password: string) {
  const userId = state.user?.id;
  await api("/account", { method: "DELETE", json: { password } });
  if (userId) writeMeta(userId, undefined);
  setState({ status: "signed-out", user: undefined, sync: { status: "idle", version: 0 } });
}

export interface SessionInfo { id: string; device: string; createdAt: string; lastSeenAt: string; current: boolean }
export interface ActivityInfo { kind: string; detail: string; at: string }
export interface ReportInfo { id: string; title: string; period: string; format: ExportFormat; shipments: number; wtwKg: number; createdAt: string }
export interface WorkspaceSummary { version: number; updatedAt?: string; device?: string; bytes?: number; summary: { factorSet: string; shipments: number; calculated: number; wtwKg: number; tonneKm: number; byMode: Record<string, number> } | null }

export const listSessions = () => api<{ sessions: SessionInfo[] }>("/account/sessions").then((body) => body.sessions);
export const revokeSession = (id: string) => api(`/account/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
export const revokeOtherSessions = () => api<{ revoked: number }>("/account/sessions/revoke-others", { method: "POST" });
export const listActivity = () => api<{ activity: ActivityInfo[] }>("/account/activity").then((body) => body.activity);
export const listReports = () => api<{ reports: ReportInfo[] }>("/reports").then((body) => body.reports);
export const workspaceSummary = () => api<WorkspaceSummary>("/workspace/summary");

export async function downloadAccountExport() {
  const body = await api<unknown>("/account/export");
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: "temt-account-export.json" });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Best effort: keep a history of generated reports on the account. Never blocks the download. */
export function recordReport(format: ExportFormat, model: ReportModel) {
  if (state.status !== "signed-in") return;
  void api("/reports", { method: "POST", json: { title: model.title, period: model.period, format, shipments: model.totals.shipments, wtwKg: model.totals.wtwKg } }).catch(() => undefined);
}
