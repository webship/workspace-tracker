/**
 * What a tracker is, to the dashboard.
 *
 * A tracker holds tickets, tasks or work items: GitHub issues, GitLab work items, the work packages of
 * an open-source tracker, Jira work items. A provider knows how to list and read them, which of them a
 * project works against (its scope), and how to write back: a comment, a worklog, a transition,
 * labels, an assignee, a new item, and for a forge the pull or merge request itself. It declares what
 * it can do; the base (registerTracker) draws only that, and does every write itself, after a preview.
 *
 * The shape is Jira's on purpose (projects as scopes with an allowlist, "mine" by account, the sprint
 * as the iteration, worklog, transitions, assignee), so the Jira plugin can later be a provider of this
 * family and nothing more.
 */

/** The lists a provider can answer. The UI offers only the ones in `capabilities.views`. */
export type View = 'open' | 'mine' | 'assigned' | 'iteration' | 'board' | 'query';

/** Where a project's items live: a repository, a project of the tracker, a Jira project. */
export interface TrackerScope {
  /** What the provider calls it, and what `.tracker-<provider>` holds: 'webship/workspace-tracker-proof', 'ACME'. */
  id: string;
  /** Its name for people, when it has one. */
  name: string;
  /** Its page. */
  web: string;
}

/** Who wrote something, and how they stand with the scope: an outsider's text is handled with more care. */
export interface Person {
  name: string;
  association: 'owner' | 'member' | 'collaborator' | 'contributor' | 'outside' | 'unknown';
}

/** One item in a list. */
export interface TrackerItem {
  /** What the provider calls it inside its scope: '12' (GitHub, GitLab iid, OpenProject), 'ACME-12' (Jira, Plane). */
  id: string;
  title: string;
  url: string;
  /** The state as the service names it: 'open', 'In Progress'. */
  state: string;
  /** What kind of state it is, for the label's colour. */
  stateClass?: 'open' | 'doing' | 'done';
  type?: string;
  assignees: string[];
  labels: string[];
  /** The sprint, iteration, milestone or version it is in. */
  iteration?: string;
  /** The board column it is in. */
  column?: string;
  /** ISO time of the last change. */
  updated?: string;
}

export interface TrackerComment {
  author: Person;
  body: string;
  /** ISO time. */
  at: string;
}

/** One item, as read to be worked: the body and the comments, each with who wrote it. */
export interface TrackerItemFull extends TrackerItem {
  body: string;
  author: Person;
  /** Who last changed the body, when it was edited after it was opened. */
  lastEditor?: Person;
  comments: TrackerComment[];
}

/** What a write answered. `url` is the page of what was written (the comment, the request). */
export interface WriteResult {
  ok: boolean;
  error: string;
  url?: string;
  id?: string;
}

export interface TrackerCapabilities {
  views: View[];
  /** The word the service uses for the iteration: 'sprint', 'iteration', 'milestone', 'version'. */
  iterationWord?: string;
  comment: boolean;
  worklog: boolean;
  transition: boolean;
  labels: boolean;
  assign: boolean;
  create: boolean;
  /** 'open': the provider pushes the branch and opens a draft request itself (a forge); 'link': it links one opened elsewhere; 'none'. */
  request: 'open' | 'link' | 'none';
  /** What the requests are called there: 'pull request', 'merge request'. */
  requestNoun?: string;
}

/** A project of the workspace, as a provider is asked about it. */
export interface ProjectRef {
  workspace: string;
  project: string;
  /** The project's folder. */
  dir: string;
}

/** What `list` is asked for. `text` and `who` are passed as data (one argument), never through a shell. */
export interface TrackerQuery {
  view: View;
  text?: string;
  who?: string;
  limit: number;
}

/** What `openRequest` is given: the branch is already committed in `dir`. */
export interface RequestSpec {
  dir: string;
  /** The remote to push to ('origin'). */
  remote: string;
  branch: string;
  base: string;
  title: string;
  /** Markdown, written by the base and previewed by a person. */
  body: string;
  draft: boolean;
}

export interface TrackerProvider {
  /** The plugin's name: the route namespace, the session prefix ('<ws>--<project>--github-12'), the remembered-scope file. */
  id: string;
  /** In sentences: 'GitHub'. */
  title: string;
  /** On the button: 'GITHUB'. */
  label: string;
  /** What an item is called there. */
  noun: { one: string; many: string };
  capabilities: TrackerCapabilities;
  /** What an item id looks like here, checked before any call. */
  idPattern: RegExp;
  /** '' when the provider can be used here; else the sentence the disabled menu carries (the CLI is missing, nobody signed in). */
  ready: () => string;
  /** The scope a project works against: the one it remembers, its git remote, or the default. Null: none. */
  scopeOf: (project: ProjectRef) => TrackerScope | null;
  /** The scopes the credential can see, for the picker and the settings page. */
  scopes?: () => Promise<TrackerScope[]>;
  /** A scope typed or remembered, checked: the scope, or null when it is not one. */
  parseScope: (text: string) => TrackerScope | null;
  list: (scope: TrackerScope, query: TrackerQuery) => Promise<TrackerItem[]>;
  get: (scope: TrackerScope, id: string) => Promise<TrackerItemFull>;
  urlOf: (scope: TrackerScope, id: string) => string;
  /** The account the service sees, for "mine", the audit line and the settings page; never a token. */
  account?: () => Promise<string>;
  /** Variables that carry this provider's token: removed from every AI session the base starts. */
  tokenVariables?: string[];
  /** The token itself, only so that outgoing text can be checked for it; never shown, never logged. */
  secret?: () => string;
  /**
   * The shapes of the platform's own tokens, each with the words a refusal says ("an OpenProject token"): the guard
   * refuses them in whatever is about to be posted, beside the shapes it knows and the provider's own token.
   */
  tokenShapes?: Array<[string, RegExp]>;
  /** The CLI a session must not run (gh, glab, twg): denied in the author session. */
  cli?: string;

  /** The default branch of the scope's repository ('main'): a run's branch starts from it, and its request goes against it. */
  defaultBranch?: (scope: TrackerScope) => Promise<string>;
  /**
   * Fetch one branch of the scope's repository into the project, with the provider's credential, and answer the ref to
   * start from ('origin/main'). Without it the base fetches origin and starts from origin's HEAD.
   */
  fetchBranch?: (scope: TrackerScope, dir: string, branch: string) => Promise<{ ok: boolean; error: string; ref: string }>;

  // ---- Writes: optional, each one offered when it is here, declared and writes are on. ----
  comment?: (scope: TrackerScope, id: string, markdown: string) => Promise<WriteResult>;
  worklog?: (scope: TrackerScope, id: string, entry: { minutes: number; text: string }) => Promise<WriteResult>;
  transitions?: (scope: TrackerScope, id: string) => Promise<{ id: string; name: string }[]>;
  transition?: (scope: TrackerScope, id: string, to: string) => Promise<WriteResult>;
  labels?: (scope: TrackerScope, id: string, add: string[], remove: string[]) => Promise<WriteResult>;
  assign?: (scope: TrackerScope, id: string, who: string) => Promise<WriteResult>;
  create?: (scope: TrackerScope, item: { title: string; body: string }) => Promise<WriteResult>;
  openRequest?: (scope: TrackerScope, request: RequestSpec) => Promise<WriteResult>;
  linkRequest?: (scope: TrackerScope, id: string, url: string) => Promise<WriteResult>;
}
