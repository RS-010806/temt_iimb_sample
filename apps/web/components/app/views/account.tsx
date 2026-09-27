"use client";

import { useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, CloudUpload, Download, Eye, EyeOff, FileClock, History, KeyRound, LaptopMinimal, LoaderCircle, LogOut, MonitorSmartphone, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { MODE_LABELS, type TransportMode } from "@temt/calculator";
import {
  ApiError, changePassword, deleteAccount, downloadAccountExport, listActivity, listReports, listSessions, retrySync, revokeOtherSessions, revokeSession, signIn, signOut, signUp,
  updateProfile, useAccount, workspaceSummary, type ActivityInfo, type ReportInfo, type SessionInfo, type WorkspaceSummary,
} from "@/lib/account";
import { totals } from "@/lib/analytics";
import { EXPORT_FORMATS } from "@/lib/exports/common";
import { emissionsText, fmt, formatDate } from "@/lib/format";
import { actions, useComputed } from "@/lib/store";
import { relative, SyncIcon, syncLabel } from "../account-menu";
import { Field, FieldIdContext, Modal, PageHeader, Segmented, cx, useToast } from "../../ui";

const ACTIVITY: Record<string, string> = {
  account_created: "Account created", signed_in: "Signed in", profile_updated: "Profile updated", password_changed: "Password changed", session_revoked: "Session signed out",
  sessions_revoked: "Other sessions signed out", workspace_synced: "Workspace synced", report_generated: "Report generated",
};
const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

function Card({ title, description, icon, children, className }: { title: string; description?: ReactNode; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card card-pad", className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-maroon-50 text-maroon-700">{icon}</span>
        <div><h2 className="card-title">{title}</h2>{description && <p className="mt-0.5 text-[13px] text-grey-600">{description}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function PasswordInput({ value, onChange, autoComplete, label }: { value: string; onChange: (value: string) => void; autoComplete: string; label?: string }) {
  const [show, setShow] = useState(false);
  const id = useContext(FieldIdContext);
  return (
    <div className="input-affix">
      <input id={id} className="input" type={show ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} aria-label={label} required />
      <button type="button" className="absolute right-3 grid h-7 w-7 place-items-center rounded-md text-grey-500 hover:text-ink" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </div>
  );
}

function StorageNote() {
  const storage = useAccount((value) => value.storage);
  if (!storage || storage.persistent) return null;
  return (
    <p className="callout callout-warn text-[13px]">
      This server is running with temporary account storage, so accounts reset when it restarts. Your workspace always stays saved in this browser. The site owner can connect a free Postgres database to keep accounts permanently.
    </p>
  );
}

function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ name: "", organisation: "", jobTitle: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(undefined);
    try {
      if (mode === "signin") await signIn({ email: form.email, password: form.password });
      else await signUp({ name: form.name, organisation: form.organisation, jobTitle: form.jobTitle, email: form.email, password: form.password });
    } catch (caught) { setError(message(caught)); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-maroon-800 via-maroon-900 to-maroon-950 p-7 text-white">
        <p className="eyebrow eyebrow-light">TEMT account</p>
        <h2 className="display mt-2 text-[30px] leading-tight">Your freight footprint, on every device.</h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-maroon-100">TEMT works without an account. Sign in when you want a secure copy of your workspace and a record of what you have reported.</p>
        <ul className="mt-6 grid gap-3 text-[14px]">
          {[
            [CloudUpload, "Sync shipments and settings across browsers and devices"],
            [FileClock, "Keep a history of every report you generate"],
            [MonitorSmartphone, "See active sessions and sign out anywhere"],
            [Download, "Download or delete everything with one click"],
          ].map(([Icon, text]) => { const I = Icon as typeof CloudUpload; return <li key={text as string} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><I size={16} aria-hidden="true" /></span>{text as string}</li>; })}
        </ul>
        <p className="mt-6 flex items-start gap-2 text-[12.5px] leading-relaxed text-maroon-200"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> Passwords are hashed with scrypt, sessions use secure HttpOnly cookies, and every database query is parameterised.</p>
      </div>
      <form className="card card-pad grid content-start gap-4" onSubmit={submit} noValidate>
        <Segmented ariaLabel="Account" value={mode} onChange={(value) => { setMode(value); setError(undefined); }} options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]} />
        {mode === "signup" && (
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="Your name"><input className="input" value={form.name} onChange={(event) => set({ name: event.target.value })} autoComplete="name" required /></Field>
            <Field label="Job title" hint="Optional"><input className="input" value={form.jobTitle} onChange={(event) => set({ jobTitle: event.target.value })} autoComplete="organization-title" /></Field>
            <div className="sm:col-span-2"><Field label="Organisation" hint="Optional"><input className="input" value={form.organisation} onChange={(event) => set({ organisation: event.target.value })} autoComplete="organization" /></Field></div>
          </div>
        )}
        <Field label="Work email"><input className="input" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} autoComplete="email" required /></Field>
        <Field label="Password" hint={mode === "signup" ? "At least 10 characters. A short phrase works well." : undefined}><PasswordInput value={form.password} onChange={(password) => set({ password })} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></Field>
        {error && <p className="callout callout-warn text-[13px]" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{mode === "signin" ? "Sign in" : "Create account"}</button>
        <p className="text-[12.5px] leading-relaxed text-grey-600">{mode === "signin" ? "After you sign in, this browser's workspace is compared with your account and kept in sync." : "Your current workspace becomes the first copy in your account."}</p>
        <StorageNote />
      </form>
    </div>
  );
}

function WorkspaceCard() {
  const sync = useAccount((value) => value.sync);
  const rows = useComputed();
  const local = useMemo(() => totals(rows), [rows]);
  const [summary, setSummary] = useState<WorkspaceSummary>();
  const [error, setError] = useState<string>();
  useEffect(() => { workspaceSummary().then(setSummary, (caught) => setError(message(caught))); }, [sync.version]);
  const server = summary?.summary;
  const matches = server ? Math.abs(server.wtwKg - local.wtwKg) < Math.max(1, local.wtwKg * 1e-6) && server.shipments === rows.length : false;
  return (
    <Card title="Cloud workspace" description="Changes sync automatically a few seconds after you make them." icon={<CloudUpload size={18} aria-hidden="true" />} className="xl:col-span-2">
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1fr]">
        <div className="rounded-xl bg-stone-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><SyncIcon status={sync.status} size={16} /> {syncLabel(sync)}</p>
          <p className="mt-1 text-[13px] text-grey-600">{sync.version ? `Version ${sync.version}` : "No copy in your account yet"}{summary?.device ? ` · last from ${summary.device}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={retrySync} disabled={sync.status === "syncing" || sync.status === "conflict"}>Sync now</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void downloadAccountExport()}><Download size={14} aria-hidden="true" /> Download my data</button>
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-semibold text-grey-600">This browser</p>
          <p className="num mt-1 text-xl font-bold">{emissionsText(local.wtwKg)}</p>
          <p className="text-[13px] text-grey-600">{fmt(rows.length)} shipments · {fmt(local.tonneKm / 1e6, 2)} million t-km</p>
        </div>
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-semibold text-grey-600">Account copy, recalculated on the server</p>
          {server ? <>
            <p className="num mt-1 text-xl font-bold">{emissionsText(server.wtwKg)}</p>
            <p className="text-[13px] text-grey-600">{fmt(server.shipments)} shipments{server.calculated < server.shipments ? ` (${fmt(server.shipments - server.calculated)} not calculable)` : ""}</p>
            {matches && <p className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-ok"><CheckCircle2 size={13} aria-hidden="true" /> Matches this browser</p>}
          </> : <p className="mt-1 text-[13px] text-grey-600">{error ?? (summary ? "Nothing synced yet." : "Loading…")}</p>}
        </div>
      </div>
      {server && Object.keys(server.byMode).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(server.byMode).sort((a, b) => b[1] - a[1]).map(([mode, kg]) => <span key={mode} className="badge badge-stone"><span className="dot" style={{ background: `var(--mode-${mode})` }} aria-hidden="true" />{MODE_LABELS[mode as TransportMode]} {emissionsText(kg)}</span>)}
        </div>
      )}
    </Card>
  );
}

function ProfileCard() {
  const user = useAccount((value) => value.user)!;
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name, organisation: user.organisation, jobTitle: user.jobTitle });
  const [busy, setBusy] = useState(false);
  const dirty = form.name !== user.name || form.organisation !== user.organisation || form.jobTitle !== user.jobTitle;
  return (
    <Card title="Profile" description={`Signed in as ${user.email} since ${formatDate(user.createdAt.slice(0, 10))}.`} icon={<UserRound size={18} aria-hidden="true" />}>
      <form className="grid gap-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await updateProfile(form); toast({ tone: "ok", message: "Profile saved." }); } catch (caught) { toast({ tone: "warn", message: message(caught) }); } finally { setBusy(false); } }}>
        <Field label="Name"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></Field>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Organisation"><input className="input" value={form.organisation} onChange={(event) => setForm({ ...form, organisation: event.target.value })} autoComplete="organization" /></Field>
          <Field label="Job title"><input className="input" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} autoComplete="organization-title" /></Field>
        </div>
        <button type="submit" className="btn btn-primary justify-self-start" disabled={!dirty || busy}>Save profile</button>
      </form>
    </Card>
  );
}

function ReportsCard() {
  const version = useAccount((value) => value.sync.version);
  const [reports, setReports] = useState<ReportInfo[]>();
  useEffect(() => { listReports().then(setReports, () => setReports([])); }, [version]);
  const label = (format: string) => EXPORT_FORMATS.find((item) => item.id === format)?.label ?? format;
  return (
    <Card title="Report history" description="Every report generated while signed in, on any device." icon={<FileClock size={18} aria-hidden="true" />}>
      {!reports ? <p className="text-[13px] text-grey-600">Loading…</p> : reports.length === 0 ? <p className="text-[13px] text-grey-600">No reports yet. Reports you export from the Reports page appear here.</p> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Generated</th><th>Period</th><th>Format</th><th className="right">Emissions</th></tr></thead>
          <tbody>{reports.slice(0, 12).map((report) => <tr key={report.id}><td>{formatDate(report.createdAt.slice(0, 10))}</td><td>{report.period}</td><td>{label(report.format)}</td><td className="right num">{emissionsText(report.wtwKg)}</td></tr>)}</tbody>
        </table></div>
      )}
    </Card>
  );
}

function SecurityCard() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionInfo[]>();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState(false);
  const refresh = () => listSessions().then(setSessions, () => setSessions([]));
  useEffect(() => { void refresh(); }, []);
  return (
    <Card title="Security" description="Change your password and manage where you are signed in." icon={<KeyRound size={18} aria-hidden="true" />}>
      <form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await changePassword(pw.current, pw.next); setPw({ current: "", next: "" }); toast({ tone: "ok", message: "Password changed. Other sessions were signed out." }); void refresh(); } catch (caught) { toast({ tone: "warn", message: message(caught) }); } finally { setBusy(false); } }}>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Field label="Current password"><PasswordInput value={pw.current} onChange={(current) => setPw({ ...pw, current })} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 10 characters"><PasswordInput value={pw.next} onChange={(next) => setPw({ ...pw, next })} autoComplete="new-password" /></Field>
        </div>
        <button type="submit" className="btn btn-secondary btn-sm justify-self-start" disabled={busy || !pw.current || pw.next.length < 10}>Change password</button>
      </form>
      <div className="mt-5 border-t border-stone-200 pt-4">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Active sessions</h3>
          {sessions && sessions.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { try { const { revoked } = await revokeOtherSessions(); toast({ tone: "ok", message: `Signed out ${revoked} other session${revoked === 1 ? "" : "s"}.` }); } catch (caught) { toast({ tone: "warn", message: message(caught) }); } void refresh(); }}>Sign out other sessions</button>}
        </div>
        <ul className="mt-2 grid gap-2">
          {(sessions ?? []).map((session) => (
            <li key={session.id} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2.5 text-[13px]">
              <LaptopMinimal size={16} className="shrink-0 text-grey-600" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="font-semibold">{session.device}</span>{session.current && <span className="badge badge-ok ml-2">This browser</span>}<span className="block text-xs text-grey-600">Active {relative(session.lastSeenAt)} · signed in {formatDate(session.createdAt.slice(0, 10))}</span></span>
              {!session.current && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { try { await revokeSession(session.id); } catch (caught) { toast({ tone: "warn", message: message(caught) }); } void refresh(); }}>Sign out</button>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function ActivityCard() {
  const version = useAccount((value) => value.sync.version);
  const [activity, setActivity] = useState<ActivityInfo[]>();
  useEffect(() => { listActivity().then(setActivity, () => setActivity([])); }, [version]);
  return (
    <Card title="Account activity" description="Sign-ins, syncs, reports and security changes." icon={<History size={18} aria-hidden="true" />}>
      <ol className="grid gap-2.5">
        {(activity ?? []).slice(0, 10).map((item, i) => (
          <li key={i} className="flex gap-3 text-[13px]"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-maroon-400" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="font-semibold">{ACTIVITY[item.kind] ?? item.kind}</span>{item.detail && <span className="text-grey-600"> · {item.detail}</span>}</span><span className="shrink-0 text-xs text-grey-500">{relative(item.at)}</span></li>
        ))}
        {activity?.length === 0 && <li className="text-[13px] text-grey-600">No activity yet.</li>}
      </ol>
    </Card>
  );
}

function DangerCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [clearLocal, setClearLocal] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card card-pad border-maroon-200 xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="card-title">Delete account</h2><p className="mt-0.5 text-[13px] text-grey-600">Permanently removes your account, its workspace copy, report history and sessions from TEMT's server.</p></div>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)}><Trash2 size={15} aria-hidden="true" /> Delete account</button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your TEMT account?" footer={<>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="btn btn-danger" disabled={!password || busy} onClick={async () => { setBusy(true); setError(undefined); try { await deleteAccount(password); if (clearLocal) actions.clearShipments(); setOpen(false); } catch (caught) { setError(message(caught)); } finally { setBusy(false); } }}>Delete permanently</button>
      </>}>
        <div className="grid gap-4">
          <p className="text-[14px] text-grey-700">This cannot be undone. Download your data first if you may need it.</p>
          <Field label="Confirm with your password"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></Field>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={clearLocal} onChange={(event) => setClearLocal(event.target.checked)} /> Also remove the shipments saved in this browser</label>
          {error && <p className="callout callout-warn text-[13px]" role="alert">{error}</p>}
        </div>
      </Modal>
    </section>
  );
}

export function AccountView() {
  const account = useAccount((value) => value);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [clearLocal, setClearLocal] = useState(false);
  if (account.status === "loading") return <div className="grid min-h-[40vh] place-items-center text-grey-600"><LoaderCircle className="animate-spin" aria-label="Loading account" /></div>;
  if (account.status === "unavailable") {
    return (
      <div>
        <PageHeader eyebrow="Account" title="Account" description="Sign-in needs TEMT's server, which could not be reached." />
        <p className="callout callout-info max-w-2xl text-[14px]">Everything else in TEMT works without an account, and your workspace is saved in this browser. Try again later, or use Settings to back up the workspace to a file.</p>
      </div>
    );
  }
  if (account.status === "signed-out") {
    return (
      <div>
        <PageHeader eyebrow="Account" title="Sign in to TEMT" description="Optional. Keep a synced, secure copy of your workspace and report history." />
        <AuthPanel />
      </div>
    );
  }
  const user = account.user!;
  return (
    <div>
      <PageHeader eyebrow="Account" title={user.name} description={[user.jobTitle, user.organisation].filter(Boolean).join(" · ") || user.email}
        actions={<button type="button" className="btn btn-secondary" onClick={() => setConfirmSignOut(true)}><LogOut size={16} aria-hidden="true" /> Sign out</button>} />
      <div className="mb-6"><StorageNote /></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <WorkspaceCard />
        <ProfileCard />
        <SecurityCard />
        <ReportsCard />
        <ActivityCard />
        <DangerCard />
      </div>
      <Modal open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Sign out of TEMT?" footer={<>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmSignOut(false)}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={async () => { await signOut(); if (clearLocal) actions.clearShipments(); setConfirmSignOut(false); }}>Sign out</button>
      </>}>
        <p className="text-[14px] text-grey-700">Your account keeps its synced copy. {account.sync.status === "synced" ? "Everything in this browser is synced." : "Some changes in this browser may not be synced yet."}</p>
        <label className="mt-4 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={clearLocal} onChange={(event) => setClearLocal(event.target.checked)} /> Remove the shipments saved in this browser (for shared computers)</label>
      </Modal>
    </div>
  );
}
