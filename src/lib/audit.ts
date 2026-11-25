/**
 * The audit line of every write the base does for a person: one JSON line in the dashboard's
 * actions.log, beside the line the dashboard writes for the request itself. It says which provider,
 * scope and item, what was written, who clicked, the account the service saw, and the URL written.
 * No body, no token: an error text that holds something token-shaped is not kept.
 */

import fs from 'fs';
import path from 'path';

import { tokensIn } from './text';

export interface AuditEntry {
  provider: string;
  scope: string;
  item: string;
  workspace: string;
  project: string;
  /** 'push+request', 'comment', 'worklog', 'move', 'labels', 'assign', 'create', 'session-comment'. */
  write: string;
  /** Who clicked: the signed-in person, or the contributor of the settings, or 'local'. */
  by: string;
  /** The account the service saw. */
  as: string;
  url: string;
  ok: boolean;
  error?: string;
}

export function auditFile(root: string): string {
  return path.join(root, 'core', 'workspace-app', 'actions.log');
}

/** Append the line. It never throws: the write has happened, and the audit must not hide its answer. */
export function auditWrite(root: string, e: AuditEntry, now = new Date()): string {
  const error = e.error ? (tokensIn(e.error).length ? '[an error text that held a credential-shaped string]' : String(e.error).slice(0, 200)) : undefined;
  const line = JSON.stringify({ time: now.toISOString(), action: 'tracker-write', ...e, ...(error ? { error } : {}) });
  try { fs.appendFileSync(auditFile(root), `${line}\n`); } catch (_) { /* never block the answer */ }
  return line;
}
