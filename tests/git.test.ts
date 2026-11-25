import test, { after } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { BRANCH_RE, gitOps, worktreeDir } from '../src/lib/git';
import { cleanup, fakeApi, workspaceTree } from './fake';

after(cleanup);

test('a branch, its commits, the diff, and what is not committed', async () => {
  const root = workspaceTree();
  const dir = path.join(root, 'dev', 'site1');
  const git = gitOps(fakeApi(root).api.lib.run);
  assert.ok(await git.isRepo(dir));
  assert.strictEqual(await git.currentBranch(dir), 'main');
  assert.deepStrictEqual(await git.dirty(dir), []);
  assert.ok((await git.newBranch(dir, '12-fix')).ok);
  assert.ok(await git.branchExists(dir, '12-fix'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# site1, fixed\n');
  assert.deepStrictEqual(await git.dirty(dir), ['README.md']);
  execFileSync('git', ['-C', dir, 'commit', '-qam', 'Fix the README']);
  assert.deepStrictEqual((await git.commitsAhead(dir, 'main', '12-fix')).map((l) => l.replace(/^\w+ /, '')), ['Fix the README']);
  assert.match(await git.diffStat(dir, 'main', '12-fix'), /README\.md \| 2 \+-/);
  assert.match(await git.diff(dir, 'main', '12-fix'), /\+# site1, fixed/);
});

test('the dashboard runs git with hooks off', async () => {
  const root = workspaceTree();
  const dir = path.join(root, 'dev', 'site1');
  const marker = path.join(root, 'hook-ran');
  fs.writeFileSync(path.join(dir, '.git', 'hooks', 'post-checkout'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  const git = gitOps(fakeApi(root).api.lib.run);
  assert.ok((await git.newBranch(dir, 'b1')).ok);
  assert.ok(!fs.existsSync(marker), 'a hook the session could plant does not run for the dashboard');
  execFileSync('git', ['-C', dir, 'switch', '-q', 'main']);
  assert.ok(fs.existsSync(marker), 'the same hook runs for a plain git');
});

test('a change to the local git config changes its hash: a push compares it', async () => {
  const root = workspaceTree();
  const dir = path.join(root, 'dev', 'site1');
  const git = gitOps(fakeApi(root).api.lib.run);
  const before = await git.configHash(dir);
  assert.strictEqual(await git.configHash(dir), before);
  execFileSync('git', ['-C', dir, 'config', 'url.https://evil.test/.insteadOf', 'https://forge.test/']);
  assert.notStrictEqual(await git.configHash(dir), before);
  assert.ok((await git.configKeys(dir)).includes('url.https://evil.test/.insteadof'));
});

test('a worktree goes outside the workspace folders and keeps its branch when removed', async () => {
  const root = workspaceTree();
  const dir = path.join(root, 'dev', 'site1');
  const git = gitOps(fakeApi(root).api.lib.run);
  const wt = worktreeDir(root, 'dev', 'site1', 'github', '12');
  assert.strictEqual(wt, path.join(root, '.tracker', 'worktrees', 'dev', 'site1', 'github-12'));
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  assert.ok((await git.addWorktree(dir, wt, '12-fix', 'main')).ok);
  assert.strictEqual(await git.currentBranch(wt), '12-fix');
  assert.strictEqual(await git.currentBranch(dir), 'main', 'the project stays on its branch');
  fs.writeFileSync(path.join(wt, 'new.txt'), 'x');
  assert.ok(!(await git.removeWorktree(dir, wt)).ok, 'git refuses a worktree with changes, and that refusal stands');
  fs.unlinkSync(path.join(wt, 'new.txt'));
  assert.ok((await git.removeWorktree(dir, wt)).ok);
  assert.ok(await git.branchExists(dir, '12-fix'));
});

test('branch names: what git and a person can both read', () => {
  for (const ok of ['12-fix-the-readme', 'github-12-x', 'feature/12-x', 'a.b_c']) assert.ok(BRANCH_RE.test(ok), ok);
  for (const bad of ['-x', 'a..b', 'a b', 'a//b', 'x/', 'x.', '$(id)', '']) assert.ok(!BRANCH_RE.test(bad), bad);
});
