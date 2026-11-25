/**
 * The dashboard's own git commands on a project: the branch or worktree a run works on, what the run
 * committed, the diff for the person and the reviewer, and the checks before anything is pushed.
 *
 * A session can write into the project's `.git`: a hook, a filter, a credential helper, an `insteadOf`
 * that sends a push somewhere else. So every command here runs with hooks and fsmonitor off, and a push
 * is refused when the project's local git config is not what it was when the session started.
 */

import crypto from 'crypto';
import path from 'path';
import type { PluginLib, RunResult } from '@webship.co/workspace-plugin-api';

/** What every git command of the dashboard runs with: no hooks, no fsmonitor, no ext:: transport, no external diff. */
export const GIT_SAFE = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'protocol.ext.allow=never', '-c', 'diff.external='];

/** A branch name git accepts and a person can read: no spaces, no `..`, not starting with `-`. */
export const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*[/.]$)[A-Za-z0-9][A-Za-z0-9._/-]{0,90}$/;

export function gitOps(run: PluginLib['run']) {
  const git = (dir: string, args: string[], timeoutMs = 60 * 1000): Promise<RunResult> =>
    run('git', [...GIT_SAFE, '-C', dir, ...args], dir, { timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
  const out = (r: RunResult) => String(r.stdout || '').trim();

  async function isRepo(dir: string): Promise<boolean> {
    const r = await git(dir, ['rev-parse', '--is-inside-work-tree']);
    return r.ok && out(r) === 'true';
  }
  async function currentBranch(dir: string): Promise<string> {
    const r = await git(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    return r.ok ? out(r) : '';
  }
  /** The files with changes not committed (staged, unstaged, untracked), as `git status --porcelain` names them. */
  async function dirty(dir: string): Promise<string[]> {
    const r = await git(dir, ['status', '--porcelain', '--untracked-files=normal']);
    // Not trimmed: each line starts with two status columns, the first of which may be a space.
    return r.ok ? String(r.stdout || '').split('\n').filter((l) => l.trim()).map((l) => l.slice(3)) : ['(git status did not answer)'];
  }
  async function branchExists(dir: string, name: string): Promise<boolean> {
    return (await git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`])).ok;
  }
  /** A new branch in the project itself, from `start` (a ref) or from where the project is. */
  async function newBranch(dir: string, name: string, start = ''): Promise<RunResult> {
    return git(dir, ['switch', '--no-track', '-c', name, ...(start ? [start] : [])]);
  }
  /** origin's default branch as git knows it here ('origin/main'), after a fetch; '' when origin has no HEAD. */
  async function originHead(dir: string): Promise<string> {
    const f = await git(dir, ['fetch', '--quiet', 'origin'], 120 * 1000);
    if (!f.ok) return '';
    let r = await git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (!r.ok) { await git(dir, ['remote', 'set-head', 'origin', '--auto'], 60 * 1000); r = await git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']); }
    return r.ok ? out(r) : '';
  }
  /** Back to the branch the run started from, when nothing was done on the new one. */
  async function switchTo(dir: string, name: string): Promise<RunResult> {
    return git(dir, ['switch', name]);
  }
  /** A worktree outside the workspace folders, on a new branch from `start`. */
  async function addWorktree(dir: string, wtDir: string, name: string, start: string): Promise<RunResult> {
    return git(dir, ['worktree', 'add', '--no-track', '-b', name, wtDir, start], 120 * 1000);
  }
  /** Remove a worktree; git refuses while it has changes, and that refusal stands. */
  async function removeWorktree(dir: string, wtDir: string): Promise<RunResult> {
    return git(dir, ['worktree', 'remove', wtDir]);
  }
  async function commitsAhead(dir: string, base: string, branch: string): Promise<string[]> {
    const r = await git(dir, ['log', '--format=%h %s', '--no-color', `${base}..${branch}`]);
    return r.ok ? out(r).split('\n').filter(Boolean) : [];
  }
  async function diffStat(dir: string, base: string, branch: string): Promise<string> {
    const r = await git(dir, ['diff', '--no-ext-diff', '--no-textconv', '--stat', '--no-color', `${base}...${branch}`]);
    return r.ok ? out(r) : '';
  }
  async function diff(dir: string, base: string, branch: string): Promise<string> {
    const r = await git(dir, ['diff', '--no-ext-diff', '--no-textconv', '--no-color', `${base}...${branch}`], 120 * 1000);
    return r.ok ? String(r.stdout || '') : '';
  }
  /** A hash of the local git config (`.git/config` and its includes as git reads them): what a push compares. */
  async function configHash(dir: string): Promise<string> {
    const r = await git(dir, ['config', '--local', '--list', '--show-origin']);
    return crypto.createHash('sha256').update(String(r.stdout || '')).digest('hex');
  }
  /** The keys of the local git config, for saying what changed. */
  async function configKeys(dir: string): Promise<string[]> {
    const r = await git(dir, ['config', '--local', '--name-only', '--list']);
    return r.ok ? out(r).split('\n').filter(Boolean) : [];
  }
  async function remoteUrl(dir: string, remote: string): Promise<string> {
    const r = await git(dir, ['remote', 'get-url', '--push', remote]);
    return r.ok ? out(r) : '';
  }
  async function remotes(dir: string): Promise<string[]> {
    const r = await git(dir, ['remote']);
    return r.ok ? out(r).split('\n').filter(Boolean) : [];
  }

  return { git, isRepo, currentBranch, dirty, branchExists, newBranch, originHead, switchTo, addWorktree, removeWorktree, commitsAhead, diffStat, diff, configHash, configKeys, remoteUrl, remotes };
}

/** Where the worktree of an item goes: under the workspace root, outside every workspace folder. */
export function worktreeDir(root: string, workspace: string, project: string, provider: string, item: string): string {
  return path.join(root, '.tracker', 'worktrees', workspace, project, `${provider}-${String(item).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
}
