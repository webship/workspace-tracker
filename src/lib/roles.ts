/**
 * The core's AI CLI roles: who is the author, who reviews, and whether each can run here. Read from
 * `bash core/scripts/ai-items.sh roles`, which answers from core/config/ai.settings.yml over
 * ai.defaults.yml, cached for a minute. A workspace without that command has Claude Code as its author.
 */

import fs from 'fs';
import path from 'path';
import type { PluginLib } from '@webship.co/workspace-plugin-api';

export interface Role { role: string; label: string; ready: boolean; why: string }

/** The lines `ai-items.sh roles` prints, read: `author           Claude Code          ready`. */
export function parseRoles(text: string): Role[] {
  const out: Role[] = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^(author|reviewer|second_opinion)\s+(.*?)\s+(ready|skipped: .*)$/);
    if (m) out.push({ role: m[1], label: m[2].trim(), ready: m[3] === 'ready', why: m[3] === 'ready' ? '' : m[3].replace(/^skipped: /, '') });
  }
  return out;
}

/** Whether a role's CLI is Claude Code: the author runs interactively then. */
export const isClaude = (r: Role | undefined) => !r || /^claude code$/i.test(r.label);

export function rolesReader(lib: PluginLib) {
  let cache: { at: number; roles: Role[] } = { at: 0, roles: [] };
  const script = () => path.join(lib.ROOT, 'core', 'scripts', 'ai-items.sh');
  return async function roles(): Promise<Role[]> {
    if (Date.now() - cache.at < 60 * 1000) return cache.roles;
    let list: Role[] = [];
    if (fs.existsSync(script())) {
      const r = await lib.run('bash', [script(), 'roles'], lib.ROOT, { timeoutMs: 30 * 1000 });
      list = parseRoles(String(r.stdout || ''));
    }
    if (!list.some((x) => x.role === 'author')) list.unshift({ role: 'author', label: 'Claude Code', ready: true, why: '' });
    cache = { at: Date.now(), roles: list };
    return list;
  };
}
