# Issue tracker: GitHub

Issues and PRDs live in this repository's GitHub Issues. Use the `gh` CLI; it infers the repository from the Git remote.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Add or remove labels with `gh issue edit`; close with `gh issue close`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Keep this off unless external PRs should be triaged as feature requests.

## Skill operations

- When a skill says to publish to the issue tracker, create a GitHub issue.
- When a skill says to fetch a ticket, run `gh issue view <number> --comments`.

## Wayfinding operations

The map is a single GitHub issue labelled `wayfinder:map`, containing the destination, notes, decisions so far, fog, and out-of-scope sections.

- **Child tickets** are GitHub sub-issues of the map, created through `POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues` with the child issue's numeric database ID as `sub_issue_id`. If sub-issues are unavailable, add the child to a task list in the map body and put `Part of #<map>` at the top of its body.
- **Ticket labels** use `wayfinder:<type>`: `research`, `prototype`, `grilling`, or `task`.
- **Blocking** uses GitHub's native issue dependencies. To make a ticket blocked, call `POST /repos/{owner}/{repo}/issues/{child}/dependencies/blocked_by` with the blocker's numeric database ID as `issue_id` (not its issue number or node ID). If native dependencies are unavailable, use a `Blocked by: #<n>` line at the top of the child body.
- A ticket is unblocked when all its blockers are closed. The frontier is the open, unblocked, unassigned child issues, in map order.
- Claim a ticket by assigning it to the driving developer before work begins. Resolve it by commenting with the answer, closing it, and appending a context pointer to the map's Decisions-so-far section.