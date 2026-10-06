# Mergentra

Mergentra helps individual developers understand the relationships among references and commits in a local Git repository.

## Git history

**Branch**:
A named, movable reference to a commit. A branch points to its current tip; Git does not record the action or exact moment when the branch was created.
_Avoid_: Fork

**Remote-tracking reference**:
A local reference that records the last fetched position of a branch on a remote. It is distinct from a local branch, even when both point to the same commit.
_Avoid_: Remote branch (when the local remote-tracking reference is meant)

**Commit graph**:
The directed acyclic graph formed by commits and their parent relationships. Branches and tags reference commits in this graph.
_Avoid_: Branch graph (when the commit relationships are meant)

**Branch divergence**:
The point at which histories reachable from different branch tips extend beyond a shared ancestor. Git does not store a branch-creation event.
_Avoid_: Fork event

**Merge commit**:
A commit with multiple parents that joins histories in the commit graph.
_Avoid_: Merge line (when the commit itself is meant)

**Tag**:
A named reference to a commit, commonly used to mark a release. Unlike a branch, a tag is not expected to move as new commits are added.

**Worktree**:
A working directory linked to a repository's shared Git history. A repository can have multiple worktrees checked out at different branches or commits.

**Shallow clone**:
A clone whose recorded history intentionally stops before the full ancestry of its commits.

**Partial clone**:
A clone that intentionally omits some Git objects, which may be retrieved later from a promisor remote.

**Detached HEAD**:
A state where `HEAD` points directly to a commit instead of naming a local branch.

**Unborn branch**:
The named branch for an empty repository before its first commit, when the branch reference does not yet point to a commit.

## Implementation map

The Electron main process owns Git execution, settings-file access, and IPC. `src/main.js` wires modules for the Git runner, settings store, Git-output parsing, reference ordering, divergence markers, IPC handlers, and window creation. The preload script remains the only bridge to the renderer; its channel names and payloads are part of the process boundary.

The renderer uses native ES modules without a bundler. Its entry point wires focused UI modules for reference picking, the Review dock, repository controls, remote actions, time and zoom controls, notes, and popovers to pure time-range, lane, layout, compaction, release-version, and time-axis calculations. Graph calculations do not depend on the DOM, Electron, or persisted storage.

Unit tests in `tests/unit/` exercise pure calculations and storage/process seams. The feature-grouped Playwright specs in `tests/` cover behavior through the Electron app and share setup through `tests/e2e-helpers.cjs`.
