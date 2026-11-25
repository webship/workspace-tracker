/**
 * The text the base writes for a person to post: the body of a draft request, a comment on the item,
 * a new item. Built from fixed text and the author's notes, shown in an editable preview, scanned for
 * anything token-shaped before it goes. Pure functions: the tests read them.
 */

import { cap, oneLine } from './text';

const CHECKPOINTS = [
  'File an issue about this project',
  'Addition/Change/Update/Fix to this project',
  'Testing to ensure no regression',
  'Automated unit/functional testing coverage',
  'Developer Documentation support on feature change/addition',
  'User Guide Documentation support on feature change/addition',
  'UX/UI designer responsibilities',
  'Accessibility and Readability',
  'Reviewed by a human',
  'Code review by maintainers',
  'Full testing and approval',
  'Credit contributors',
  'Review with the product owner',
  'Update Release Notes',
  'Release',
];

/** The Checkpoints list, with only the named ones ticked; the two human-review boxes are never ticked. */
export function checkpoints(done: string[] = []): string {
  const never = new Set(['Reviewed by a human', 'Code review by maintainers']);
  return ['### Checkpoints', ...CHECKPOINTS.map((c) => `- [${done.includes(c) && !never.has(c) ? 'x' : ' '}] ${c}`)].join('\n');
}

/** One section of the notes the author wrote (`## What changed`), or ''. */
export function notesSection(notes: string, heading: string): string {
  const lines = String(notes || '').split('\n');
  const at = lines.findIndex((l) => new RegExp(`^#{1,3}\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(l.trim()));
  if (at < 0) return '';
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => /^#{1,3}\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

export interface RequestBodyInput {
  /** '#12' on a forge, or the item's link elsewhere. */
  closes: string;
  itemUrl: string;
  notes: string;
  cliLabel: string;
  /** The Checkpoints that are done: the item exists, and the branch has commits. */
  done: string[];
}

/** The body of a draft pull or merge request. */
export function requestBody(i: RequestBodyInput): string {
  const changed = notesSection(i.notes, 'What changed') || oneLine(i.notes).slice(0, 600) || 'See the commits.';
  const check = notesSection(i.notes, 'How to check it');
  const notDone = notesSection(i.notes, 'What was not done');
  return [
    `Closes ${i.closes}`,
    cap(changed, 4000),
    ...(check ? ['#### How to check it', cap(check, 2000)] : []),
    ...(notDone ? ['#### Not done', cap(notDone, 1500)] : []),
    `Worked from ${i.itemUrl} by ${i.cliLabel} in a Webship Workspace screen session, on this branch. A person reviews it before it is merged.`,
    'AI-Generated: Yes',
    checkpoints(i.done),
    ...(/claude code/i.test(i.cliLabel) ? ['🤖 Generated with [Claude Code](https://claude.com/claude-code)'] : []),
  ].join('\n\n');
}

/** The comment on the item once a request is open. */
export function requestComment(i: { requestNoun: string; requestUrl: string; notes: string; cliLabel: string; where: string }): string {
  const changed = notesSection(i.notes, 'What changed');
  return [
    `A draft ${i.requestNoun} for this is open: ${i.requestUrl}`,
    ...(changed ? [cap(changed, 1500)] : []),
    `_Worked by ${i.cliLabel} in ${i.where}, from the Webship Workspace. A person reviews it before it is merged._`,
  ].join('\n\n');
}

/** The comment that a session started on the item: who and where, never a transcript. */
export function sessionComment(i: { cliLabel: string; where: string; session: string; watch: string; claude: string }): string {
  return [
    `🤖 ${i.cliLabel} is working on this in **${i.where}**.`,
    '',
    `- session: \`${i.session}\``,
    `- watch it: ${i.watch}`,
    ...(i.claude ? [`- resume the conversation on that machine: \`claude --resume ${i.claude}\``] : []),
    '',
    '_Started from the Webship Workspace dashboard. The session runs on that machine, and a person reviews what it does._',
  ].join('\n');
}

/** A new item for a folder, in the Webship issue shape, from "What is it for?". */
export function newItemBody(what: string): string {
  return [
    '### Problem/Motivation',
    String(what || '').trim() || '<!-- What the folder is for. -->',
    '### Proposed resolution',
    '<!-- To be written. -->',
    checkpoints(['File an issue about this project']),
  ].join('\n\n');
}
