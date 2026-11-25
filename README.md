# @webship.co/workspace-tracker

The tracker family's shared base for [Webship Workspace](https://github.com/webship/workspace) plugins. A person picks a
ticket, a task or a work item of a service (GitHub issues, GitLab work items, an open-source tracker). The dashboard reads
it once, as data, into a spec. The workspace's AI CLI (the core's `author` role, Claude Code by default) works it on a branch
of the project in a screen session the person watches. The person decides what goes back: a draft pull or merge request and
a comment, each a click after a preview, only when writes are on. Nothing is merged, closed, deployed or released.

The design, with the review folded in: [#1](https://github.com/webship/workspace-tracker/issues/1).

## Use it in a plugin

```ts
import { registerTracker } from '@webship.co/workspace-tracker';

export function register(api: PluginApi) {
  registerTracker(api, myProvider(api));                                   // a standalone tracker: a menu of its own
}

// A forge (GitHub, GitLab) keeps one button: its own menu shows the tracker's entries.
const tracker = registerTracker(api, githubTracker(api), { menu: 'none', settingsBlock: 'tracker' });
registerForge(api, { ...githubForge(api), menuItems: tracker.menuItems });
```

A provider is a `TrackerProvider` (`src/provider.ts`). It says how to list and read items, which scope a project works against, and
what it can do (`capabilities`). Each write is an optional method: `comment`, `worklog`, `transitions` and `transition`, `labels`,
`assign`, `create`, `openRequest` (a forge pushes the branch and opens a draft request) and `linkRequest`. The UI shows a view or an
action only when the provider declares it and has the method, and a write also needs writes on. The shape is Jira's on purpose
(projects with an allowlist, "mine", sprints as the iteration, worklog, transitions, assignee), so the Jira plugin can later be a provider.

## What the base draws

| Piece | What it is |
| --- | --- |
| The menu | A row menu named for the provider, or entries in a forge's menu: "Issues — get, analyze, work…" and the scope the row works against |
| The list | Open, Mine, Assigned to…, the current iteration (sprint, milestone, version), Board, Search, as the provider declares. A number typed in the filter opens that item. The agents at work, and per item Open and Do the work |
| One item | Overview (who wrote it and how they stand with the project, hidden text, the runs), Analyze (read-only, kept as `02-analysis.md`), Do the work, Result, Runs; with writes on, Comment, Log work, Move, Labels, Assign |
| The result | The branch, its commits and diff stat, what is not committed, the author's notes, Ask the reviewer, Preview the draft request, Preview the comment |
| The badge | The item a live author session works, on the project's card |
| New folder | "Create a <noun> for it", written by the dashboard from "What is it for?" (writes on, a default scope set) |

## Do the work

1. **A person starts it.** Nothing starts from the service. One run per item, `max_agents` across the provider.
2. **The item is read once** into the core's spec layout, `specs/<ws>/<project>/NNN-<provider>-<item>-<slug>/`: `spec.yml` (target, topic,
   issue, the tracker fields, branch, base, the request once opened) and `01-story.md`, the item framed as data.
3. **A branch** in the project (refused while it has uncommitted changes; nothing is stashed), or **a worktree** under
   `.tracker/worktrees/`, outside every workspace folder.
4. **The author** is the core's `author` role (`core/config/ai.settings.yml`). Claude Code runs interactively in a screen session, from a
   private script: `claude --session-id … --settings <session settings> --add-dir <spec> --append-system-prompt-file <rules> "$(cat <prompt>)"`.
   No permission mode is passed: the project's own applies. Another author CLI runs through the core runner (`ai-items.sh run --role author`).
5. **The result** waits for the person: the branch, the commits, `notes.md`. **The reviewer** (the core's `reviewer` role, a different AI
   provider) reads the diff against the item, kept in `collaboration/` with its verdict.
6. **With writes on**, the person previews and posts a draft request (`Closes #N`, the notes, `AI-Generated: Yes`, the Checkpoints with the
   two human-review boxes never ticked) and a comment. Each write is a line in `core/workspace-app/actions.log`.

## The ticket text is untrusted

Anyone who can file, edit or comment on an item writes text the AI reads. The main defences:

1. **The session holds no token.** Token variables (`GH_TOKEN`, `GITHUB_TOKEN`, `GITLAB_TOKEN`, …, and the provider's own) are unset in the
   session script and denied inside the sandbox. The plugin's settings file is never sent. The provider's token is used only by the
   dashboard's own calls.
2. **The dashboard does every write, after a preview.** The AI never pushes, opens a request, comments, logs work or moves the item. A
   person clicks each write after reading a preview they can edit. A token-shaped string (GitHub, GitLab and Slack tokens, AWS keys, JSON
   Web Tokens, PEM blocks, the provider's own token) blocks the post. Before a push, the dashboard checks that the project's git
   config is what it was when the session started, and its own git commands run with hooks off.

Around them:

- **The person in charge.** A run starts only from the dashboard, and the opening prompt and the rules are shown before Start.
  An item opened by someone outside the project (not a member or collaborator), or whose body was last edited by such a person, is
  analyze only unless the person ticks a confirmation that names them. With `outsider_items: refuse` it is analyze only.
- **Data, not instructions.** The rules are the session's system prompt. The item is a file, framed and fenced. Its fence is longer than any run
  of backticks in it. HTML comments, `<details>`, zero-width, bidi and tag characters are made visible. Comments from outside the project
  are left out by default. No ticket text is ever in a shell line or a prompt.
- **The sandbox.** With `sandbox: required` (the default), the author session runs Claude Code's sandboxed Bash: no network domain
  unless the settings list one, credential files and variables denied, no unsandboxed retry. It refuses to start without the sandbox.
- **Deny rules**, as defence in depth: `git push`, `gh`, `glab`, `curl`, `wget`, `ssh`, `nc`, `twg`, the provider's CLI, WebFetch,
  WebSearch, and reading `core/config`, `~/.config/gh`, `~/.ssh`, `.env`. A command prefix is not a boundary (`python3 -c` gets past
  it); these catch the obvious, not the determined.
- **Isolation and review.** A new branch or worktree, a draft request, nothing merged; a reviewer from a different AI provider; the
  author lists the instructions in the item that it did not follow.

**The residual risk, plainly:** the session runs as your user. Outside the sandbox, or with `sandbox: off`, it can read what your user
can read and reach what your user can reach. Inside the sandbox, Read and Glob still see every file the permission rules do not deny. A
ticket can steer the session within the project and its permissions. **Do the work only on items you trust**, and read the diff before
any write.

### The sandbox on Ubuntu 24.04

Claude Code's sandbox on Linux needs `bubblewrap` and `socat`. Ubuntu 24.04 restricts unprivileged user namespaces
(`kernel.apparmor_restrict_unprivileged_userns=1`). With that restriction, bubblewrap cannot start, and a session with `sandbox: required`
refuses to run ("sandbox required but unavailable").

The narrow fix allows user namespaces for bubblewrap only. Add its AppArmor profile, then load it:

```bash
sudo tee /etc/apparmor.d/bwrap > /dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/bwrap
bwrap --ro-bind / / --dev /dev --proc /proc --unshare-net true && echo "bubblewrap works"
```

The broader option lifts the restriction for every program until the next reboot:
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.

`sandbox: off` in the settings runs the author session without the sandbox, as a person's choice. The Do the work form then says so.

## Settings

A standalone tracker keeps these at the top of `core/config/plugin.<name>.settings.yml`; a forge plugin keeps them in its `tracker:` block.

| Key | Default | What it is |
| --- | --- | --- |
| `allow_writes` | `false` | Push and draft request, comment, worklog, move, labels, assign, create. Off: everything stays on this machine |
| `max_agents` | `1` | Author sessions at once, across the provider |
| `default_scope` | | The scope a project works against when it has none of its own (its remote, or a remembered one) |
| `scopes` | `[]` | The scopes the list may be switched to; empty is any |
| `work_in` | `branch` | `branch` in the project, or `worktree` outside the workspace folders |
| `sandbox` | `required` | `required`: no sandbox, no author session. `off`: a person's choice, said in the form |
| `network_domains` | `[]` | Domains the sandbox allows (the project's package registries) |
| `allow_web` | `false` | WebFetch and WebSearch in the author session |
| `comments_from` | `members` | The comments a snapshot keeps: `members`, `all`, `none` |
| `outsider_items` | `analyze` | An outsider's item: `analyze` (work it only after a confirmation that names them) or `refuse` |
| `draft` | `true` | Open requests as drafts |

## Where things are kept

| Where | What |
| --- | --- |
| `specs/<ws>/<project>/NNN-<provider>-<item>-<slug>/` | `spec.yml`, `01-story.md`, `02-analysis.md`, `notes.md`, `work.diff`, `collaboration/` (the runs, `record.md` with "Decision (a person)") |
| `.screens/tracker/<session>/` | The session's `rules.md`, `prompt.md`, `settings.json`, `session.sh` (mode 600) and `run.json` (its note) |
| `<project>/.tracker-<provider>` | The scope a project remembers, kept out of git through `.git/info/exclude` |
| `.tracker/worktrees/<ws>/<project>/<provider>-<item>` | A worktree, removed from the Result tab; its branch stays |
| `core/workspace-app/actions.log` | A `tracker-write` line per write: provider, scope, item, write, who clicked, the account, the URL, ok |

## Develop

```bash
npm ci
npm run lint
npm test          # node:test on the compiled TypeScript; git runs for real in temporary folders
```

## License

ISC (see `LICENSE`).
