"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Cloud, CloudOff, LoaderCircle, LogIn, LogOut, RefreshCw, UserRound } from "lucide-react";
import { loadAccount, resolveConflict, retrySync, signOut, useAccount, type AccountState } from "@/lib/account";
import { formatDate } from "@/lib/format";
import { Modal, cx } from "../ui";

export const initials = (name?: string) => (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

export function syncLabel(sync: AccountState["sync"]) {
  if (sync.status === "syncing") return "Syncing…";
  if (sync.status === "conflict") return "Choose which copy to keep";
  if (sync.status === "offline") return "Offline: saved in this browser";
  if (sync.status === "error") return sync.message ?? "Sync failed";
  if (sync.status === "synced") return sync.at ? `Synced ${relative(sync.at)}` : "Synced";
  return "Not synced yet";
}

export function relative(at: string) {
  const seconds = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return formatDate(at.slice(0, 10));
}

export function SyncIcon({ status, size = 14 }: { status: AccountState["sync"]["status"]; size?: number }) {
  if (status === "syncing") return <LoaderCircle size={size} className="animate-spin text-grey-500" aria-hidden="true" />;
  if (status === "conflict" || status === "error") return <AlertTriangle size={size} className="text-warn" aria-hidden="true" />;
  if (status === "offline") return <CloudOff size={size} className="text-grey-500" aria-hidden="true" />;
  return <Cloud size={size} className={status === "synced" ? "text-ok" : "text-grey-500"} aria-hidden="true" />;
}

const reopenListeners = new Set<() => void>();
const reopenConflict = () => reopenListeners.forEach((listener) => listener());

/** Top-bar account entry: sign in, or the signed-in user's menu with sync status. */
export function AccountMenu() {
  const account = useAccount((value) => value);
  const pathname = usePathname() ?? "/app/";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { void loadAccount(); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (account.status === "loading" || account.status === "unavailable") return null;
  if (account.status === "signed-out") {
    return <Link prefetch={false} href={`/signin/?next=${encodeURIComponent(pathname)}`} className="btn btn-secondary btn-sm" data-tour="account"><LogIn size={15} aria-hidden="true" /> <span className="hidden sm:inline">Sign in</span></Link>;
  }
  const user = account.user!;
  return (
    <div ref={ref} className="relative" data-tour="account">
      <button type="button" className="flex items-center gap-2 rounded-full border border-stone-300 bg-white py-1 pl-1 pr-2.5 transition hover:border-maroon-300" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={`Account: ${user.name}. ${syncLabel(account.sync)}`}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-maroon-700 text-[11px] font-bold text-white">{initials(user.name)}</span>
        <SyncIcon status={account.sync.status} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[var(--shadow-float)] animate-rise">
          <div className="border-b border-stone-200 px-4 py-3">
            <p className="truncate text-sm font-bold">{user.name}</p>
            <p className="truncate text-xs text-grey-600">{user.email}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-grey-700"><SyncIcon status={account.sync.status} size={13} /> {syncLabel(account.sync)}</p>
          </div>
          <div className="grid p-1.5 text-sm">
            <Link prefetch={false} role="menuitem" href="/app/account/" className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-stone-100" onClick={() => setOpen(false)}><UserRound size={16} aria-hidden="true" /> Account and security</Link>
            {account.sync.status === "conflict"
              ? <button type="button" role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left font-semibold text-warn hover:bg-stone-100" onClick={() => { reopenConflict(); setOpen(false); }}><AlertTriangle size={16} aria-hidden="true" /> Resolve sync conflict</button>
              : <button type="button" role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-stone-100 disabled:opacity-50" disabled={account.sync.status === "syncing"} onClick={() => { retrySync(); setOpen(false); }}><RefreshCw size={16} aria-hidden="true" /> Sync now</button>}
            <button type="button" role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-stone-100" onClick={() => { void signOut(); setOpen(false); }}><LogOut size={16} aria-hidden="true" /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Asks which copy to keep when this browser and the account both changed. */
export function SyncConflictDialog() {
  const sync = useAccount((value) => value.sync);
  const [busy, setBusy] = useState<string>();
  const [hidden, setHidden] = useState(false);
  const conflict = sync.status === "conflict" ? sync.conflict : undefined;
  useEffect(() => { setHidden(false); }, [conflict?.version]);
  useEffect(() => { const reopen = () => setHidden(false); reopenListeners.add(reopen); return () => { reopenListeners.delete(reopen); }; }, []);
  const choose = async (choice: "account" | "device" | "merge") => { setBusy(choice); try { await resolveConflict(choice); } finally { setBusy(undefined); } };
  const options: { id: "merge" | "account" | "device"; title: string; body: string }[] = [
    { id: "merge", title: "Combine both", body: "Keep every shipment from both copies. Where the same shipment was edited in both, the newer edit wins." },
    { id: "account", title: "Use the account copy", body: "Replace this browser's workspace with the copy saved to your account." },
    { id: "device", title: "Keep this browser's copy", body: "Overwrite the account copy with this browser's workspace." },
  ];
  return (
    <Modal open={!!conflict && !hidden} onClose={() => setHidden(true)} title="Your account has a different copy of this workspace">
      <p className="text-[14px] leading-relaxed text-grey-700">
        The account copy{conflict?.device ? ` was last synced from ${conflict.device}` : " changed"}{conflict?.updatedAt ? ` ${relative(conflict.updatedAt)}` : ""}{conflict?.shipments !== undefined ? ` and has ${conflict.shipments} shipments` : ""}. This browser also has changes. Sync is paused and nothing is lost until you choose.
      </p>
      <div className="mt-4 grid gap-2">
        {options.map((option) => (
          <button key={option.id} type="button" disabled={!!busy} onClick={() => void choose(option.id)} className={cx("rounded-xl border p-3.5 text-left transition hover:border-maroon-400 hover:bg-maroon-50 disabled:opacity-60", option.id === "merge" ? "border-maroon-300" : "border-stone-200")}>
            <p className="flex items-center gap-2 text-sm font-bold">{busy === option.id && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}{option.title}{option.id === "merge" && <span className="badge badge-maroon">Recommended</span>}</p>
            <p className="mt-1 text-[13px] text-grey-600">{option.body}</p>
          </button>
        ))}
      </div>
      {sync.message && <p className="callout callout-warn mt-3 text-[13px]" role="alert">{sync.message}</p>}
    </Modal>
  );
}
