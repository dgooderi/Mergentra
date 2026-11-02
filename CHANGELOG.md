# Changelog

All notable changes to Mergentra are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.1] - 2026-11-03

### Changed

- Updated the website with a new screenshot and a download section for the experimental Linux (x64 and arm64) and Windows on ARM builds, which asks for testers and issue reports (#112, #113).

### Security

- Updated dependencies so no known Dependabot alerts remain: the build tooling now uses minimatch 11.0.1 (#114).

## [1.3.0] - 2026-11-02

### Added

- Hovering a branch line shows its name (and your note for it, if any) in a tooltip. Side lanes are named from the merge that brought them in and describe the segment ("branched from", "merging into"). Turn it off with "Show branch names on hover" in Settings (#108).
- The Large repository warning is now an in-app dialog styled like the rest of the app instead of a native message box, so it no longer clashes with the dark theme (#107).

### Fixed

- Selecting a merge commit in a large repository no longer freezes the window; branch inference now builds a per-graph index once instead of walking history for every reference (#109).
- Hovering a merged-in branch no longer labels every side lane with the name of the branch it merged into.

### Changed

- Removed the permanent "Branch diverges" label above branch points; the divergence marker remains for screen readers.

### Security

- Updated dependencies to resolve Dependabot alerts: electron 44.10.1, undici, fast-uri, and vite 8.3.5 (the website build pins it with an override); the lint tooling uses minimatch 11.0.1 (#84, #110).

## [1.2.0] - 2026-11-02

### Added

- Experimental Linux builds (AppImage, `.deb`, `.rpm`) for x64 and arm64 via `npm run build:linux`, with an Ubuntu CI job that runs the unit tests and builds the packages. AppImage installs can download updates; package installs leave updating to the package manager (#103).
- Experimental Windows on ARM installer, portable and MSI builds via `npm run build:win:arm64` and `npm run build:win:msi:arm64`; the updater picks the matching arm64 file.
- The compacted-commit popover summarizes the hidden run: date span, ordinary and merge
  commit counts, and distinct authors, computed from the commits currently shown.
- Read-only Branch health report comparing each local branch with the target branch (or the main line): unique and behind commit counts, last commit date, and an inferred divergence point that selects the commit in the graph. Shallow or partial history is flagged as uncertain, and branches with no meaningful comparison are explained (#91).
- A local Fetch guard log in Settings records each Fetch safety warning and your
  decision (names of risky settings only, never values); it is never transmitted
  and can be cleared.
- Commit search above the graph, matching message, author, hash prefix, author date, and
  reference or tag names, with selection that reveals commits hidden by filters.
- Explanations and manual next steps for shallow and missing-object history boundaries (#93).
- Read-only commit diff viewer in the Review dock: view a selected commit's changed paths and text diff, or compare two commits. Binary files, submodules, shallow-clone boundaries and unavailable commits are explained rather than shown as misleading text (#85).
- File history: enter a file or folder path to highlight and list the commits that
  changed it, following renames, with notes for missing paths and shallow history.
- Read-only blame view in the Review dock: enter a file path to see which commit and author last changed each line at the selected commit, and select an attributed commit to jump to it in the graph.
- A read-only Stashes panel listing each stash with its message, originating branch, date, and base commit. Selecting a stash shows its changed paths; unreadable or missing stash objects are reported clearly.
- Read-only Reflog panel listing the entries of `HEAD` or a local branch with their
  action, time and commit, including commits no longer reachable from any reference.
  Entries can be shown in the graph when the commit is in it, and entries for
  unreachable, expired or missing commits are explained.

## [1.1.0] - 2026-11-02

### Added

- Opening a repository can be cancelled, and repositories with very many branches ask for confirmation first.
- Neighbouring branch lanes are recoloured by hue, saturation, and lightness so lanes that run side by side stay distinct.

### Changed

- Every branch merged into another gets its own lane instead of sharing one, so separate branches no longer overlap or share a colour.
- Merge lines curve directly into the merge commit.
- Branches are ordered and coloured by how recently their tip was committed.

## [1.0.0] - 2026-10-18

### Added

- Target branch selection with inferred parent paths through `main`.
- Straight horizontal branch lanes with curved connectors between branches.
- Dotted continuation lanes for visible parent branches with no later commits.
- Per-branch notes and editable branch colors from the References picker or graph.
- Windows NSIS, portable, and x64 MSI distribution packages.

### Changed

- Commit labels in the graph show hashes only.
- Target views hide unrelated branch histories while preserving the selected
  branch's parent chain and colors.
- Added calendar-bounded custom time navigation.

## [0.11.0] - 2026-10-09

### Added

- `npm run measure:render` measures render cost on synthetic histories up to 1,000,000 commits (#13).
- A code of conduct, a Discussions link in the issue chooser, and pointers to Discussions in the readme and CONTRIBUTING.md.
- Automatic weekly update check with an update dialog (download and install, download, release notes, skip this version), a Settings toggle, and checksum-verified downloads. Off by default for MSI installs (#62).
- Versioned license agreement: accepted on first run, shown again when the bundled terms change, readable in Settings, and accepted by policy for managed installs. The text is a placeholder (#64).
- MSI build target: `npm run build:win:msi` produces a per-machine x64 `Mergentra-<version>-x64.msi` that upgrades in place and carries an `install-channel` marker (#63).

### Changed

- Split `drawCommitNode` into smaller helpers and moved main-process settings state into `src/app-state.js` (#14).

### Fixed

- Panning no longer swallows clicks on the "+N" commit summaries or Shift-click zoom; a drag starts after 4 px of movement.
- Restored the ellipsis in the "Loading repository history..." message.
- End-to-end tests no longer depend on the user's global Git signing configuration.

## [0.10.0]

### Added

- Clone a repository over HTTPS or SSH, with a history-only option, cancel, and redacted diagnostics (#38).
- Open and Clone tabs on the start screen, with equal-height panels that fit the default window without scrolling (#46, #49, #51).
- Application icons at 256, 128, 64, 48, 32 and 16 px, a splash screen, and the logo on the start screen, the repository header and the README (#48, #50).
- Right-click a commit to show the branches from main to that commit, or the commit's branch and its parent (#52).
- Drag the commit graph left or right to pan it (#53).
- Drag across the time axis to select a custom date range.
- Editable display names for recent repositories, with pencil and trash icons and a confirmation before removal. The name is only a label and never renames the folder (#56).
- A default directory setting that Browse starts in (#39).
- Repository notes render a safe Markdown subset (bold, lists, line breaks).
- The Review dock shows the inferred source and destination branches.
- The checked-out branch lane glows along its whole length.
- `master` is treated as the main line, like `main`.
- The zoom percentage is a dropdown that also accepts a typed value.
- The window starts maximised (#58).

### Changed

- The repository note sits to the right of the logo and the repository details (#55, #57).
- Current Branch is shown directly under Path, and both are labelled.
- The note's Preview button is beside the note, and the note is at least three lines tall (#43, #44).
- Settings is a cog icon button, centred and larger, and the theme switch lives in Settings (#41).
- Recent repositories are a combobox capped at 10 entries, with icon buttons that leave more room for the list (#56).
- Once a custom date range is chosen on the axis, further axis drags are disabled until the span is widened (#54).
- Toolbar button heights and gaps are aligned, disabled buttons are styled, and the zoom controls are padded.
- The clone URL field is as wide as the folder field, and the History only checkbox is spaced evenly (#45, #47).
- The extra card around the Clone form is removed (#51).

### Fixed

- Leftover debug logging in the splash screen.

### Project

- Added CONTRIBUTING.md, a CLA and a CLA bot workflow.
- The README documents manual testing on the VS Code repository, and includes a screenshot.

## [0.9.0]

First public release.
