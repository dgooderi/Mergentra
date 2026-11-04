# Accessibility

Mergentra aims to make exploring Git history usable by people with a range of
accessibility needs. Accessibility is an ongoing part of the project, and
feedback about barriers is welcome.

## Current status

The app uses accessibility names and states for many controls, semantic roles
for dialogs and status messages, and visible keyboard-focus styling. These
implementation details do not guarantee that every workflow works well with
every input method or assistive technology.

Mergentra has not had a comprehensive accessibility audit, and this document
does not claim conformance with WCAG, EN 301 549, or another accessibility
standard. Some interactions or visualizations may have accessibility
limitations.

## Reporting an accessibility barrier

Please report accessibility problems through
[GitHub Issues](https://github.com/dgooderi/Mergentra/issues). Include, if
possible:

- The Mergentra version and operating system.
- The steps that led to the barrier and what you expected to happen.
- The input method or assistive technology involved and its version.

Please avoid including private repository data or other sensitive
information. You can also use GitHub Issues to suggest improvements to
accessibility.

## Accessibility goals

As the app develops, we aim to:

- Keep interactive controls operable with a keyboard and make focus visible.
- Provide meaningful names, roles, and states for controls and status
  information.
- Avoid communicating important information through color alone.
- Consider text scaling, contrast, and motion when designing or updating
  interfaces.
- Test accessibility as part of changes to user-facing workflows.
