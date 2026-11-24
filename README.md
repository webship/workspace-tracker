# @webship.co/workspace-tracker

The tracker family's shared base for [Webship Workspace](https://github.com/webship/workspace) plugins: the
`TrackerProvider` contract, and the work-item surface every tracker plugin builds on. A person picks a ticket, a task
or a work item of a service (GitHub issues and projects, GitLab work items, an open-source tracker); the dashboard reads
it, an AI CLI of the workspace works it on a branch of the project in a screen session, and the person decides what
goes back: a draft pull or merge request and a comment, only when writes are on.

The design is in issue [#1](https://github.com/webship/workspace-tracker/issues/1). The code, the tests and CI come
with the first release, `1.0.0`.

## License

ISC (see `LICENSE`).
