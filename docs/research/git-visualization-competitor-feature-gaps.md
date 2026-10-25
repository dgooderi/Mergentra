# Git Visualization Competitors: Feature Gaps vs. Mergentra

## Question

Mergentra is a read-only, Windows-first, single-local-repository branch/commit
graph viewer (see `readme.md` and `CONTEXT.md` in this repo). What history-
and branch-visualization features do the closest comparable products
document today — GitKraken, Fork, Tower, GitButler, and the VS Code "Git
Graph" extension — that Mergentra does not have? Which of those gaps fit
Mergentra's stated read-only, single-repo scope versus requiring a scope
departure (because they write to the repository)? And, separately, what
genuinely new ideas (not copied from any competitor) would build on
Mergentra's documented strengths — deterministic divergence-point marking,
strict read-only security model with a guarded Fetch, time-range
clipping/compaction for huge histories, and shallow/partial-clone/worktree
awareness?

## Findings

### 1. GitKraken — Commit Graph: rich search/filter, AI, and inline Git actions

GitKraken's dedicated Commit Graph feature page
(https://gitkraken.com/features/commit-graph) documents an interactive graph
with search, filtering, and direct Git actions from the graph itself:

> "Open any Git repo and visualize the commit history so you can immediately
> see branches, merges, tags, refs and how they relate."
>
> "Right-click on commits or branches to reveal Git actions (rebase, revert,
> etc.) without jumping to a different tool."
>
> "Track down exactly what you need. Search by message, author, file, code
> changes, or even with natural language using AI. Filter by author or team,
> show or hide tags, branches, or stashes, and dim the noise of merge
> commits to keep your focus sharp."
> — https://gitkraken.com/features/commit-graph

The GitKraken features index (https://gitkraken.com/features) additionally
documents a "Merge Tool" ("View side by side changes, prevent merge
conflicts before pull requests, and get AI suggestions you can review"),
"Workspaces" ("Connect, organize, and manage multiple Git repositories
across providers from a single, clear dashboard"), and "Launchpad" ("Track
pull requests, issues, and work in progress across multiple repositories in
one view") — all team/multi-repo/PR-integration features outside a
single-local-repo read-only viewer's scope.

### 2. Fork — interactive rebase, blame, reflog recovery, and line-by-line staging

Fork's own marketing/feature page (https://git-fork.com/) lists, among its
documented capabilities:

> "Edit, reorder and squash your commits using visual interactive rebase."
>
> "With blame view you can find the last commit which changed a particular
> line."
>
> "Restore lost commits with Reflog"
>
> "Stage / unstage changes line-by-line"
>
> "With history view you can find all commits where a particular file or
> directory was changed."
> — https://git-fork.com/

Fork's own page also documents resolving merge conflicts ("Resolve your
merge-conflicts easily using the merge-conflict helper and built-in
merge-conflict resolver") and viewing diffs for images ("Fork allows you to
see diffs for the common image formats") — i.e., Fork is a full read/write
Git client with a diff viewer, not a read-only history viewer.

### 3. Tower — undo-anything model and clear visualization framing

Tower's "Undo Anything in Git" feature page
(https://www.git-tower.com/features/undo) documents an undo stack that
spans both working-copy and history-mutating operations:

> "In Tower, you can undo: deleting a file; staging/unstaging a file;
> discarding a chunk or file; the commit itself (changes will be brought
> back to your working copy)."
>
> "In Tower, you can undo: creating, checking out and deleting branches;
> merging and rebasing (or an interactive rebase); publishing a branch on a
> remote."
>
> "In Tower, you can undo: saving a stash; deleting a stash; applying a
> stash."
> — https://www.git-tower.com/features/undo

Tower's features overview (https://www.git-tower.com/features/easy)
explicitly frames its value proposition as visualization paired with
read/write convenience: "Tower's clear visual interface can be incredibly
helpful — and make complex scenarios a lot easier to understand" alongside
"Solve merge conflicts in an easy, visual way" and "Instantly see which
commits haven't been synced with the remote." Every one of Tower's
documented "undo" targets (branch creation/deletion, merge, rebase, stash,
push) is, by definition, a write operation Mergentra's read-only design
excludes.

### 4. GitButler — virtual/parallel branches and an operations-history undo log

GitButler's docs (open-source, https://github.com/gitbutlerapp/gitbutler)
describe its signature feature, parallel ("virtual") branches, at
https://docs.gitbutler.com/features/branch-management/virtual-branches:

> "Parallel branches are a powerful feature of GitButler that allow you to
> work on multiple branches at the same time, committing to them
> independently and simultaneously... Each branch is represented as a
> vertical lane, and you can drag changes between these lanes to commit
> them independently."
> — https://docs.gitbutler.com/features/branch-management/virtual-branches

GitButler's "Operations History" / timeline feature
(https://docs.gitbutler.com/features/timeline) documents automatic
before-action snapshots and point-in-time restore:

> "Before GitButler does any major action, it records the state of
> everything (your virtual branch state, your uncommitted work, conflict
> state, etc) and stores it in your Git object database as snapshots. You
> can hit the 'revert' button on any of the entries and it will restore the
> state of all of these things to what they looked like when they were
> recorded, letting you go back in time."
> — https://docs.gitbutler.com/features/timeline

GitButler's conflict-handling docs
(https://docs.gitbutler.com/features/branch-management/merging) describe a
distinctive non-blocking rebase-with-conflicts model:

> "[GitButler] will not do what Git normally does, which is to stop at each
> conflicted commit and make you fix it before moving on. Instead, it will
> apply the changes that it can and store the commit as a 'conflicted'
> commit and continue the rebasing process."
> — https://docs.gitbutler.com/features/branch-management/merging

All three GitButler features above are fundamentally working-directory and
history-mutation features (multiple simultaneous branches, snapshot/restore
of branch+working-copy state, conflict-tolerant rebase) with no equivalent
need in a read-only viewer of already-committed history.

### 5. VS Code "Git Graph" extension (mhutchie.git-graph) — the closest scope match

The extension's own README (both the GitHub source and the Marketplace
listing mirror it; https://github.com/mhutchie/vscode-git-graph and
https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph)
documents, as the single feature most directly comparable to Mergentra, a
local commit-graph view with:

> "Hover over any commit vertex on the graph to see a tooltip indicating:
> Whether the commit is included in the HEAD. Which branches, tags and
> stashes include the commit."
>
> "Find Widget allows you to quickly find one or more commits containing a
> specific phrase (in the commit message / date / author / hash, branch or
> tag names)."
>
> "Compare any two commits by clicking on a commit, and then CTRL/CMD
> clicking on another commit. On the Commit Comparison View you can: View
> the Visual Studio Code Diff of any file change between the selected
> commits..."
>
> "Configure 'Issue Linking' - Converts issue numbers in commit messages
> into hyperlinks, that open the issue in your issue tracking system."
>
> "Code Review - Keep track of which files you have reviewed in the Commit
> Details & Comparison Views... Code Reviews persist across Visual Studio
> Code sessions."
> — https://github.com/mhutchie/vscode-git-graph

Unlike the other four products, Git Graph's _viewing_ features (hover
tooltips for ref membership, Find Widget text/date/author/hash search,
commit-to-commit diff comparison, issue-number hyperlinking, persistent
per-file code-review checklists) are read-compatible with Mergentra's
scope — it is Git Graph's _action_ features (the extensive right-click menu
documented in the same README: "Create, Checkout, Delete, Fetch, Merge,
Pull, Push, Rebase, Rename & Reset Branches... Stash... Cherry Pick, Drop,
Merge & Revert Commits") that are write operations outside Mergentra's
read-only design.

## Features Mergentra does not have, documented by competitors

| Feature                                                                                | Description                                                                                               | Documented by                                                                                                                                                                                    | Fits read-only/single-repo scope?                                                                                                                       |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline diff viewer (text + image)                                                      | View file changes for a commit or between two commits directly in the graph UI                            | Fork (https://git-fork.com/), Git Graph (https://github.com/mhutchie/vscode-git-graph)                                                                                                           | **Fits.** Reading a diff from an already-committed object is read-only; would be a pure addition, not a scope change.                                   |
| Commit message/author/hash/date full-text search ("Find Widget")                       | Quickly locate commits by phrase across message, date, author, hash, branch/tag name                      | Git Graph (https://github.com/mhutchie/vscode-git-graph), GitKraken (https://gitkraken.com/features/commit-graph)                                                                                | **Fits.** Pure read/query over history already loaded; no write involved.                                                                               |
| File-history view ("find all commits where a file changed")                            | Filter/trace the commit graph to only commits touching a given path                                       | Fork (https://git-fork.com/)                                                                                                                                                                     | **Fits.** Derivable from existing commit/parent/tree data without writing anything.                                                                     |
| Commit-to-commit comparison view                                                       | Pick any two commits and view the diff of everything that changed between them                            | Git Graph (https://github.com/mhutchie/vscode-git-graph)                                                                                                                                         | **Fits.** Read-only comparison of two already-resolved trees.                                                                                           |
| Issue-number hyperlinking in commit messages                                           | Auto-convert issue references like `#123` in commit messages into clickable links to a configured tracker | Git Graph (https://github.com/mhutchie/vscode-git-graph)                                                                                                                                         | **Fits.** Purely cosmetic/read-only text transform in the Review dock; no repo writes.                                                                  |
| Blame / annotate view                                                                  | Show the last commit that touched each line of a file at a given revision                                 | Fork (https://git-fork.com/)                                                                                                                                                                     | **Fits.** `git blame` is read-only; would be a new view, not a scope change.                                                                            |
| AI-assisted natural-language commit search                                             | Search commits using natural-language queries, not just literal text                                      | GitKraken (https://gitkraken.com/features/commit-graph)                                                                                                                                          | **Fits in principle** (read-only query) but requires either bundling/calling an AI model, a new dependency/scope question beyond "local Git only."      |
| Interactive rebase UI (reorder/edit/squash commits)                                    | Visually reorder, edit, squash, or drop commits before replaying them                                     | Fork (https://git-fork.com/), Tower (https://www.git-tower.com/features/undo), Git Graph (https://github.com/mhutchie/vscode-git-graph), GitKraken (https://gitkraken.com/features/commit-graph) | **Scope departure.** Rewrites history/refs — directly contradicts Mergentra's "never commits, checks out, merges, or edits" design.                     |
| Stash visualization and management (apply/pop/drop/create-branch-from)                 | Show stashes inline with the commit list and act on them                                                  | Fork (https://git-fork.com/, "See your stashes right in the commit list"), Git Graph (https://github.com/mhutchie/vscode-git-graph)                                                              | **Partially fits as view-only.** Listing existing stashes alongside the graph is read-only; apply/pop/drop/create are writes and are a scope departure. |
| Merge-conflict resolution UI                                                           | Guided, visual resolution of merge/rebase conflicts                                                       | Fork (https://git-fork.com/), Tower (https://www.git-tower.com/features/easy), GitButler (https://docs.gitbutler.com/features/branch-management/merging)                                         | **Scope departure.** Only possible when actually running a merge/rebase, which Mergentra does not do.                                                   |
| Cherry-pick / revert / reset from the graph                                            | Right-click a commit to cherry-pick, revert, or reset to it                                               | Git Graph (https://github.com/mhutchie/vscode-git-graph), GitKraken (https://gitkraken.com/features/commit-graph), Fork (https://git-fork.com/)                                                  | **Scope departure.** All three write new commits or move refs.                                                                                          |
| Branch/tag/remote create-delete-rename-push-pull from the graph                        | Full branch and remote lifecycle management inline                                                        | Git Graph (https://github.com/mhutchie/vscode-git-graph), Fork (https://git-fork.com/)                                                                                                           | **Scope departure** beyond Mergentra's single explicit Fetch action; create/delete/push/pull all write to the repo or remote.                           |
| Reflog-based recovery of lost commits                                                  | Browse the reflog to restore commits no longer reachable from any ref                                     | Fork (https://git-fork.com/, "Restore lost commits with Reflog")                                                                                                                                 | **Partially fits as view-only.** Displaying reflog entries is read-only; the "restore" action itself is a write and a scope departure.                  |
| Undo-anything action log for Git operations                                            | A keystroke-undoable history of every mutating action (commit, branch, merge, rebase, stash, push)        | Tower (https://www.git-tower.com/features/undo)                                                                                                                                                  | **Scope departure.** Presupposes the app performs those mutating actions in the first place; not applicable to a read-only viewer.                      |
| Virtual/parallel branches (multiple branches applied to one working directory at once) | Stage and commit changes to several independent branches simultaneously from one working tree             | GitButler (https://docs.gitbutler.com/features/branch-management/virtual-branches)                                                                                                               | **Scope departure.** Fundamentally a working-directory/commit-creation feature; no read-only analog.                                                    |
| Operations-history snapshot/restore (oplog)                                            | Automatic before-action snapshots of branch + working-copy state, revertible per entry                    | GitButler (https://docs.gitbutler.com/features/timeline)                                                                                                                                         | **Scope departure.** Exists only because GitButler performs mutating actions to snapshot around.                                                        |
| Conflict-tolerant rebase (keep going, mark conflicted commits, resolve later)          | Don't halt a rebase on first conflict; mark the commit conflicted and continue                            | GitButler (https://docs.gitbutler.com/features/branch-management/merging)                                                                                                                        | **Scope departure.** Requires actually performing a rebase.                                                                                             |
| PR/issue dashboard across repos ("Launchpad", "Workspaces")                            | Track pull requests, issues, and work-in-progress across multiple repositories/providers in one view      | GitKraken (https://gitkraken.com/features)                                                                                                                                                       | **Scope departure** from "single local repository" — would require multi-repo and network/API integration beyond local Git.                             |
| Side-by-side visual merge tool                                                         | Resolve merge conflicts with a dedicated side-by-side merge UI, including AI-suggested resolutions        | GitKraken (https://gitkraken.com/features)                                                                                                                                                       | **Scope departure.** Only meaningful mid-merge, which Mergentra never initiates.                                                                        |

## Differentiated ideas beyond feature parity

These are original proposals grounded in gaps observed above and in
Mergentra's documented strengths (deterministic divergence-point marking,
strict read-only/guarded-Fetch security model, time-range
clipping/compaction for huge histories, and shallow/partial-clone/worktree
awareness). None of these are attributed to or copied from any competitor
above; they are not primary-source-backed because they do not exist yet.

1. **Divergence-point audit trail across the whole repo.** Since Mergentra
   already computes a heuristic "first unique commit" divergence point per
   local branch against `main`, it could surface a single read-only report
   listing every local branch's divergence point, how many commits it is
   ahead/behind, and whether the divergence point itself falls inside a
   compacted run or a shallow/partial-clone boundary (so the user knows the
   heuristic might be less certain there). No competitor above documents a
   whole-repository divergence/staleness report; it is a natural extension
   of a feature Mergentra uniquely already has.

2. **Compaction-aware "what got hidden" summary.** Mergentra's compaction
   already collapses long ordinary-commit runs into an endpoint-exclusive
   count. A read-only companion view could let a user click a compacted
   run and see aggregate, non-diff metadata about what's inside it (commit
   count, distinct authors, date span, how many touched merge commits vs.
   ordinary commits) without expanding the full list — useful for very
   large histories (the VS Code-scale 190k-commit case already called out
   in the repo's own `readme.md`) where competitors' search/filter tools
   assume the whole graph is rendered, not clipped/compacted.

3. **Fetch-guard transparency log.** Mergentra already blocks risky fetches
   behind an explicit "Fetch anyway" confirmation when it detects
   settings like `core.sshCommand` or `ext::` URLs. A persistent,
   read-only, append-only local log of every guard trigger and user
   decision (never transmitted anywhere) would let a user auditing a
   shared/untrusted clone later see exactly what was flagged and when they
   overrode it — a security-and-audit feature no competitor above documents,
   because none of them have a comparable guarded-Fetch design to audit.

4. **Shallow/partial-clone boundary explainer.** Rather than only marking
   history and missing-object boundaries on the graph, add a small
   read-only panel that explains, in plain language, _why_ a given boundary
   exists (e.g., "this clone was made with `--depth 50`" vs. "this is a
   partial clone filtering blobs") and what the user would need to do
   (outside Mergentra, since it never fetches objects beyond refs) to see
   further back. This turns an existing visual marker into actionable,
   still strictly read-only guidance.

5. **Deterministic "safe diff" preview without ever writing to the repo.**
   Mergentra could compute and display a text diff for a single commit or
   between two selected commits entirely via `git show`/`git diff`
   read-only plumbing (no working-directory checkout, no index changes),
   explicitly keeping this out of scope for binary/image diffs or
   line-by-line staging (which are write-adjacent workflows in Fork/Tower).
   This would close the most-cited competitor gap (diff viewing) while
   staying inside "never commits, checks out, merges, or edits."

## Conclusion

GitKraken, Fork, Tower, and GitButler are all primarily _read/write_ Git
clients — every one of their most distinctive documented features
(interactive rebase, stash and reflog management, merge-conflict
resolution, undo-anything logs, GitButler's virtual branches and
operations-history oplog) exists specifically to help a user _change_
their repository, which is the opposite of Mergentra's explicitly
read-only design. The VS Code Git Graph extension is the closest scope
match: its _viewing_ capabilities (hover ref-membership tooltips, the Find
Widget, commit comparison diffs, issue-number linking, persistent code
review checklists) are all compatible with a read-only viewer and
represent genuine, currently-undocumented-for-Mergentra feature gaps; its
_action_ capabilities (branch/tag/stash/commit mutation from a context
menu) are not. Overall, the concretely addressable gaps for Mergentra
without a scope change are: an inline read-only diff/comparison viewer,
full-text commit search, file-history filtering, blame/annotate, read-only
stash/reflog listing (without apply/restore), and issue-number
hyperlinking. Features like interactive rebase, virtual branches,
conflict-resolution UI, and undo-anything logs would all require abandoning
Mergentra's read-only guarantee and are flagged as such above.

## Sources

- https://gitkraken.com/features — GitKraken features index (Launchpad, Workspaces, Merge Tool, Commit Graph, GitKraken AI)
- https://gitkraken.com/features/commit-graph — GitKraken Commit Graph feature page (search/filter, inline Git actions, AI natural-language search)
- https://git-fork.com/ — Fork official site feature list (interactive rebase, blame, reflog, stashes, line-by-line staging, image diffs, file history)
- https://www.git-tower.com/features/easy — Tower features overview ("Clear Visualization", merge conflicts, sync status)
- https://www.git-tower.com/features/undo — Tower "Undo Anything in Git" feature page (commit/branch/merge/rebase/stash undo)
- https://docs.gitbutler.com/ — GitButler documentation home (desktop client + CLI overview)
- https://docs.gitbutler.com/features/branch-management/virtual-branches — GitButler "Parallel Branches" (virtual branches) documentation
- https://docs.gitbutler.com/features/timeline — GitButler "Operations History" (oplog snapshot/restore) documentation
- https://docs.gitbutler.com/features/branch-management/merging — GitButler "Rebasing and Conflicts" (conflict-tolerant rebase) documentation
- https://github.com/mhutchie/vscode-git-graph — Git Graph for VS Code README (full feature list: graph view, Git actions, Find Widget, commit comparison, code review, issue linking, PR creation)
- https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph — Git Graph VS Code Marketplace listing (mirrors README feature list)
- `readme.md` (this repo) — Mergentra's own documented scope, security model, and scale testing, used as the baseline for comparison
- `CONTEXT.md` (this repo) — Mergentra's domain vocabulary and implementation map, used to confirm scope (read-only, single local repository)
