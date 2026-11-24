/**
 * The runs an item has had, live and finished: a note per screen session the base started, beside the
 * files of that session (`.screens/tracker/<session>/run.json`). `screen -ls` answers only for the live
 * ones; the notes are what let the item list its finished runs, their branch and spec, and offer to
 * resume a Claude Code conversation.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type RunKind = 'work' | 'analyze' | 'review';

export interface RunNote {
  session: string;
  kind: RunKind;
  provider: string;
  scope: string;
  item: string;
  workspace: string;
  project: string;
  /** The project's folder. */
  dir: string;
  /** Where the session works: the project, or its worktree. */
  workDir: string;
  workIn: 'branch' | 'worktree';
  /** The spec, from the workspace root, and its folder. */
  spec: string;
  specDir: string;
  branch: string;
  base: string;
  /** The CLI that played the part. */
  cli: string;
  /** The Claude Code conversation id, when the session holds one. */
  claude: string;
  /** A hash of the project's local git config when the session started: a push refuses when it changed. */
  gitConfig: string;
  at: number;
}

export interface Run extends RunNote { live: boolean }

export interface LiveSession { session: string; state?: string }

/** The session name the dashboard gives `<workspace>--<project>--<verb>` (the core's screenSessionName). */
export function sessionName(workspace: string, project: string, verb: string): string {
  const clean = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-{3,}/g, '--').replace(/^-+|-+$/g, '');
  const name = clean([workspace, project, verb].filter(Boolean).join('--'));
  if (name.length <= 60) return name;
  const hash = crypto.createHash('sha1').update(name).digest('hex').slice(0, 6);
  const ws = clean(workspace);
  const vb = clean(verb);
  const room = 60 - (ws ? ws.length + 2 : 0) - (vb ? vb.length + 2 : 0) - 7;
  if (room >= 4) {
    const pr = clean(project).slice(0, room).replace(/[-.]+$/, '');
    return [ws, `${pr}-${hash}`, vb].filter(Boolean).join('--');
  }
  return `${name.slice(0, 53).replace(/[-.]+$/, '')}-${hash}`;
}

/** The verb of a session: `<provider>-<item>` for the work, with `-analyze` or `-review` after it. */
export function verbOf(provider: string, item: string, kind: RunKind): string {
  const base = `${provider}-${String(item).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return kind === 'work' ? base : `${base}-${kind}`;
}

export function runsStore(root: string): string {
  return path.join(root, '.screens', 'tracker');
}

export function noteFile(root: string, session: string): string {
  return path.join(runsStore(root), session, 'run.json');
}

export function writeNote(root: string, note: RunNote): void {
  const file = noteFile(root, note.session);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(note, null, 2), { mode: 0o600 });
}

export function readNote(root: string, session: string): RunNote | null {
  try { return JSON.parse(fs.readFileSync(noteFile(root, session), 'utf8')) as RunNote; } catch (_) { return null; }
}

const isLive = (s: LiveSession) => !/dead/i.test(s.state || '');

/** Every run of one item of one provider, newest first, each saying whether it is still live. */
export function runsOf(root: string, provider: string, item: string, live: LiveSession[] = [], filter: { workspace?: string; project?: string } = {}): Run[] {
  const up = new Set(live.filter(isLive).map((s) => s.session));
  let names: string[] = [];
  try { names = fs.readdirSync(runsStore(root)); } catch (_) { return []; }
  const out: Run[] = [];
  for (const n of names) {
    const note = readNote(root, n);
    if (!note || note.provider !== provider || note.item !== item) continue;
    if (filter.workspace && note.workspace !== filter.workspace) continue;
    if (filter.project && note.project !== filter.project) continue;
    out.push({ ...note, live: up.has(note.session) });
  }
  return out.sort((a, b) => (Number(b.live) - Number(a.live)) || (b.at - a.at));
}

/** The live work sessions of a provider, from the notes of the sessions that are up. */
export function liveWork(root: string, provider: string, live: LiveSession[]): RunNote[] {
  return live.filter(isLive).map((s) => readNote(root, s.session)).filter((n): n is RunNote => !!n && n.provider === provider && n.kind === 'work');
}

/** The newest run of an item in a project (any kind), or null: what the Result tab reads. */
export function lastWork(root: string, provider: string, item: string, workspace: string, project: string): RunNote | null {
  return runsOf(root, provider, item, [], { workspace, project }).filter((r) => r.kind === 'work')[0] || null;
}
