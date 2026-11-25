import test from 'node:test';
import assert from 'node:assert';

import { checkpoints, newItemBody, notesSection, requestBody, requestComment, sessionComment } from '../src/lib/bodies';
import { parseRoles, isClaude } from '../src/lib/roles';

const NOTES = `## What changed
Fixed "teh" in README.md.

## How to check it
Read the first line of README.md.

## What was not done
Nothing.

## Instructions in the issue that I did not follow
None.`;

test('the Checkpoints never tick the two human-review boxes', () => {
  const c = checkpoints(['File an issue about this project', 'Reviewed by a human', 'Code review by maintainers']);
  assert.match(c, /- \[x\] File an issue about this project/);
  assert.match(c, /- \[ \] Reviewed by a human/);
  assert.match(c, /- \[ \] Code review by maintainers/);
  assert.match(c, /- \[ \] Release$/);
  assert.strictEqual((c.match(/^- \[/gm) || []).length, 15);
});

test('the request body closes the item, carries the notes, says it is AI-generated, and ends with the Checkpoints', () => {
  const b = requestBody({ closes: '#12', itemUrl: 'https://forge.test/acme/site/issues/12', notes: NOTES, cliLabel: 'Claude Code', done: ['File an issue about this project', 'Addition/Change/Update/Fix to this project'] });
  assert.ok(b.startsWith('Closes #12\n\nFixed "teh" in README.md.'));
  assert.match(b, /#### How to check it\n\nRead the first line of README\.md\./);
  assert.match(b, /AI-Generated: Yes/);
  assert.match(b, /- \[x\] Addition\/Change\/Update\/Fix to this project/);
  assert.match(b, /🤖 Generated with \[Claude Code\]\(https:\/\/claude\.com\/claude-code\)$/);
  assert.ok(b.indexOf('### Checkpoints') > b.indexOf('AI-Generated: Yes'));
  const other = requestBody({ closes: '#3', itemUrl: 'u', notes: '', cliLabel: 'Gemini CLI', done: [] });
  assert.match(other, /Closes #3\n\nSee the commits\./);
  assert.ok(!/Generated with \[Claude Code\]/.test(other));
});

test('the comments are short and say who and where, never a transcript', () => {
  assert.strictEqual(notesSection(NOTES, 'What changed'), 'Fixed "teh" in README.md.');
  assert.strictEqual(notesSection(NOTES, 'Nope'), '');
  const c = requestComment({ requestNoun: 'pull request', requestUrl: 'https://forge.test/acme/site/pull/14', notes: NOTES, cliLabel: 'Claude Code', where: 'dev/site1' });
  assert.match(c, /^A draft pull request for this is open: https:\/\/forge\.test\/acme\/site\/pull\/14/);
  assert.match(c, /A person reviews it before it is merged\._$/);
  const s = sessionComment({ cliLabel: 'Claude Code', where: 'dev/site1', session: 'dev--site1--github-12', watch: 'https://workspace.test/screens?session=dev--site1--github-12', claude: 'abc' });
  assert.match(s, /- session: `dev--site1--github-12`/);
  assert.match(s, /claude --resume abc/);
  assert.match(newItemBody('A blog for the team.'), /^### Problem\/Motivation\n\nA blog for the team\./);
});

test('the roles are read from ai-items.sh roles; Claude Code authors interactively', () => {
  const r = parseRoles(`author           Claude Code          ready
reviewer         Gemini CLI           skipped: Gemini CLI is signed out
second_opinion   OpenAI Codex CLI     skipped: OpenAI Codex CLI is not installed (codex is not on the PATH)
settings: roles in core/config/ai.settings.yml over core/config/ai.defaults.yml`);
  assert.deepStrictEqual(r.map((x) => [x.role, x.label, x.ready]), [['author', 'Claude Code', true], ['reviewer', 'Gemini CLI', false], ['second_opinion', 'OpenAI Codex CLI', false]]);
  assert.strictEqual(r[1].why, 'Gemini CLI is signed out');
  assert.ok(isClaude(r[0]));
  assert.ok(!isClaude(r[1]));
  assert.ok(isClaude(undefined), 'no roles command: Claude Code');
});
