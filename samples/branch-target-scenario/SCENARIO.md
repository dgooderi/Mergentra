# Branch target scenario

The history is intentionally small and regular:

1. `main` starts with `Initial commit`, followed by 10 main-line commits.
2. `upgrade` branches from the end of that main-line history and receives 10
   commits.
3. `feature-1` branches from `upgrade`, receives 5 commits, and is merged into
   `main` with a merge commit.
4. `feature-2` also branches from `upgrade` and receives 5 commits without
   being merged.

The sample is useful for checking target selection, horizontal branch lanes,
curved inter-branch connectors, and the faded parent continuation.
