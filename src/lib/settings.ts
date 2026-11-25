/**
 * The tracker's settings, with their defaults. A standalone tracker plugin keeps them at the top of its
 * own settings file; a forge plugin (GitHub, GitLab) keeps them in a `tracker:` block of its file.
 * Every write is off until `allow_writes` is true, per provider.
 */

import type { CommentsFrom } from './spec';

export interface TrackerSettings {
  /** Writes to the service (push and draft request, comment, worklog, move, labels, assign, create). Off by default. */
  allowWrites: boolean;
  /** Author sessions at once, across this provider. */
  maxAgents: number;
  /** The scope a project works against when it has none of its own. */
  defaultScope: string;
  /** The scopes the list offers; empty offers what the credential sees. */
  scopes: string[];
  /** Whose items "Mine" shows, when the provider needs to be told. */
  account: string;
  /** A branch in the project (sites), or a worktree outside the workspace folders (code). */
  workIn: 'branch' | 'worktree';
  /** Claude Code's sandbox for the author session: required (no sandbox, no session) or off (a person's choice). */
  sandbox: 'required' | 'off';
  /** Network domains the sandbox allows (the project's package registries); none by default. */
  networkDomains: string[];
  /** WebFetch and WebSearch in the author session. Off by default. */
  allowWeb: boolean;
  /** Which comments a snapshot keeps. */
  commentsFrom: CommentsFrom;
  /**
   * An item from outside the project (opened, or last edited, by someone who is not a member or collaborator):
   * 'analyze' (the default) is analyze only unless a person confirms by that person's name; 'refuse' is analyze only.
   */
  outsiderItems: 'analyze' | 'refuse';
  /** Requests are opened as drafts. */
  draft: boolean;
}

const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : ''; };
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter((x) => x && x !== 'CHANGE_ME') : []);

/** The tracker settings from a plugin's settings object (`block` names the sub-key, or '' for the top). */
export function readTrackerSettings(all: Record<string, any>, block = ''): TrackerSettings {
  const s = (block ? (all && typeof all[block] === 'object' && all[block]) : all) || {};
  const n = parseInt(String(s.max_agents), 10);
  return {
    allowWrites: String(s.allow_writes) === 'true',
    maxAgents: Number.isFinite(n) && n >= 1 ? Math.min(n, 8) : 1,
    defaultScope: configured(s.default_scope),
    scopes: list(s.scopes),
    account: configured(s.account),
    workIn: s.work_in === 'worktree' ? 'worktree' : 'branch',
    sandbox: s.sandbox === 'off' ? 'off' : 'required',
    networkDomains: list(s.network_domains),
    allowWeb: String(s.allow_web) === 'true',
    commentsFrom: s.comments_from === 'all' ? 'all' : s.comments_from === 'none' ? 'none' : 'members',
    outsiderItems: s.outsider_items === 'refuse' ? 'refuse' : 'analyze',
    draft: String(s.draft) !== 'false',
  };
}

/** The settings keys, for a plugin's template and its labels (dotted under the block when there is one). */
export const SETTINGS_KEYS = ['allow_writes', 'max_agents', 'default_scope', 'scopes', 'account', 'work_in', 'sandbox',
  'network_domains', 'allow_web', 'comments_from', 'outsider_items', 'draft'];
