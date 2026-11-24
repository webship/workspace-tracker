/**
 * A stand-in for the dashboard's api and a provider, for the tests: the api records what registerTracker
 * asks for and runs git for real (in temporary folders); the provider answers from fixtures and records
 * every write.
 */
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { TrackerItemFull, TrackerProvider, TrackerScope, WriteResult } from '../src/provider';

const made: string[] = [];

/** A workspace root with dev/site1 as a git repository on main, one commit. Removed by cleanup(). */
export function workspaceTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-ws-'));
  made.push(root);
  const dir = path.join(root, 'dev', 'site1');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, '.screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'core', 'workspace-app'), { recursive: true });
  const g = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Test');
  g('config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(dir, 'README.md'), '# site1\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'Start');
  return root;
}

export function cleanup(): void {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
}

export interface Calls {
  rowMenus: Record<string, { spec: any; fn: any }>;
  actions: Record<string, any>;
  fragments: any[];
  badges: any[];
  contexts: any[];
  options: any[];
  setups: any[];
  css: string[];
  started: any[];
}

export function fakeApi(root: string, settings: Record<string, any> = {}, opts: { screens?: any[]; roles?: string; startOk?: boolean } = {}) {
  const calls: Calls = { rowMenus: {}, actions: {}, fragments: [], badges: [], contexts: [], options: [], setups: [], css: [], started: [] };
  const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const run = async (cmd: string, args: string[], cwd: string) => {
    if (cmd === 'git') {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
      return { ok: r.status === 0, code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
    }
    if (cmd === 'bash' && /ai-items\.sh$/.test(args[0] || '') && args[1] === 'roles') return { ok: true, code: 0, stdout: opts.roles || '', stderr: '' };
    return { ok: false, code: 1, stdout: '', stderr: 'not in the fake' };
  };
  const api: any = {
    name: 'fake',
    config: {},
    capabilities: new Set(['row-menu-body', 'screens-only']),
    settings: { file: 'plugin.fake.settings.yml', read: () => settings, set() {}, setList() {} },
    appliesTo: () => true,
    lib: {
      esc,
      ROOT: root,
      CONFIG_DIR: path.join(root, 'core', 'config'),
      loadSettings: () => ({ contributor: { email: 'someone@example.com' } }),
      workspaceDir: (ws: string) => path.join(root, ws),
      listProjects: (dir: string) => fs.readdirSync(dir),
      isValidWorkspace: (ws: string) => /^[a-z0-9_-]+$/.test(ws) && fs.existsSync(path.join(root, ws)),
      hubDomain: () => 'workspace.test',
      screensCached: () => opts.screens || [],
      listScreens: async () => opts.screens || [],
      claudeSessionsFor: () => [],
      iconHtml: (name: string) => `<i data-icon="${name}"></i>`,
      humanTime: (d: Date) => d.toISOString(),
      tildePath: (p: string) => p,
      tabModalHtml: (o: any) => `<div class="tab-modal" data-id="${o.id}">${o.title}${o.groups.map((g: any) => g.tabs.map((t: any) => `<tab id="${t.id}" url="${t.url}"></tab>`).join('')).join('')}</div>`,
      run,
      startInScreen: async (o: any) => { calls.started.push(o); return opts.startOk === false ? { ok: false, why: 'no runner' } : { ok: true, session: `${o.workspace}--${o.project}--${o.verb}` }; },
      screenStartedHtml: (s: any, what: string) => `<div class="msg">${s.ok ? 'started' : 'not started'} ${what} ${s.session || ''}</div>`,
      NAME_RE: /^[a-zA-Z0-9_-]+$/,
      auth: { sessionOf: () => null },
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectBadge: (fn: any) => calls.badges.push(fn),
    addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFragment: (fn: any) => calls.fragments.push(fn),
    addFolderSetup: (s: any) => calls.setups.push(s),
    addSettingsOptions: (file: string, dotted: string, fn: any) => calls.options.push({ file, dotted, fn }),
    addAssistantContext: (fn: any) => calls.contexts.push(fn),
    addCss: (f: string) => calls.css.push(f),
  };
  return { api, calls };
}

export const SCOPE: TrackerScope = { id: 'acme/site', name: 'acme/site', web: 'https://forge.test/acme/site' };

export function item(over: Partial<TrackerItemFull> = {}): TrackerItemFull {
  return {
    id: '12', title: 'Fix the README typo', url: 'https://forge.test/acme/site/issues/12', state: 'open', stateClass: 'open',
    assignees: [], labels: ['bug'], body: 'The word "teh" in README.md should be "the".',
    author: { name: 'owner1', association: 'owner' }, comments: [], ...over,
  };
}

export interface Writes { comment: any[]; request: any[]; worklog: any[]; transition: any[]; labels: any[]; assign: any[]; create: any[] }

/** A provider with every capability, answering from `items`; writes are recorded and answer `result`. */
export function fakeProvider(items: Record<string, TrackerItemFull> = { 12: item() }, over: Partial<TrackerProvider> = {}) {
  const writes: Writes = { comment: [], request: [], worklog: [], transition: [], labels: [], assign: [], create: [] };
  const ok = (url = 'https://forge.test/x'): WriteResult => ({ ok: true, error: '', url });
  const p: TrackerProvider = {
    id: 'fake', title: 'Fake', label: 'FAKE', noun: { one: 'issue', many: 'issues' },
    capabilities: { views: ['open', 'mine', 'assigned', 'iteration', 'query'], iterationWord: 'milestone', comment: true, worklog: true, transition: true, labels: true, assign: true, create: true, request: 'open', requestNoun: 'pull request' },
    idPattern: /^[0-9]+$/,
    ready: () => '',
    scopeOf: () => SCOPE,
    parseScope: (t: string) => (/^[\w.-]+\/[\w.-]+$/.test(t) ? { id: t, name: t, web: `https://forge.test/${t}` } : null),
    list: async () => Object.values(items),
    get: async (_s, id) => { if (!items[id]) throw new Error('no such issue'); return items[id]; },
    urlOf: (s, id) => `${s.web}/issues/${id}`,
    account: async () => 'owner1',
    secret: () => 'fake-provider-secret-value',
    cli: 'fakecli',
    comment: async (_s, id, body) => { writes.comment.push({ id, body }); return ok(`https://forge.test/acme/site/issues/${id}#c1`); },
    worklog: async (_s, id, e) => { writes.worklog.push({ id, ...e }); return ok(); },
    transitions: async () => [{ id: 'close', name: 'Close' }],
    transition: async (_s, id, to) => { writes.transition.push({ id, to }); return ok(); },
    labels: async (_s, id, add, remove) => { writes.labels.push({ id, add, remove }); return ok(); },
    assign: async (_s, id, who) => { writes.assign.push({ id, who }); return ok(); },
    create: async (_s, i) => { writes.create.push(i); return { ...ok('https://forge.test/acme/site/issues/13'), id: '13' }; },
    openRequest: async (_s, r) => { writes.request.push(r); return ok('https://forge.test/acme/site/pull/14'); },
    ...over,
  };
  return { p, writes };
}

/** An action context that collects the answer. */
export function actionCtx(form: Record<string, string>) {
  const out: { html: string; status: number; headers: Record<string, string> } = { html: '', status: 200, headers: {} };
  const ctx: any = {
    form, workspace: form.workspace || '', pathname: '/actions/p/fake/x',
    res: { setHeader: (k: string, v: string) => { out.headers[k] = v; }, req: { headers: {} } },
    send: (html: string, status = 200) => { out.html = html; out.status = status; },
  };
  return { ctx, out };
}

/** A fragment context that collects the answer. */
export function fragmentCtx(rest: string, query: Record<string, string> = {}) {
  const out: { html: string; status: number } = { html: '', status: 200 };
  const ctx: any = { rest, searchParams: new URLSearchParams(query), req: {}, res: {}, send: (html: string, status = 200) => { out.html = html; out.status = status; } };
  return { ctx, out };
}
