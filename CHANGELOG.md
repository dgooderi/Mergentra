# Changelog

All notable changes to Mergentra are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
- The README documents manual testing on the VS Code repository, includes a screenshot, and mentions the pending SignPath code signing application.

## [0.9.0]

First public release.
