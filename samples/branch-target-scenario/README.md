# Branch target scenario

This repository is a deterministic Mergentra sample for inspecting a target
branch with a hidden parent and two feature branches.

## Branches

- `main`: initial commit plus 10 main-line commits, then a merge of `feature-1`
- `upgrade`: 10 commits from the main branch point
- `feature-1`: 5 commits from `upgrade`, merged into `main`
- `feature-2`: 5 commits from `upgrade`, left unmerged

Open this folder in Mergentra and select `feature-1` or `feature-2` as the
target branch to see the parent continuation guide.
