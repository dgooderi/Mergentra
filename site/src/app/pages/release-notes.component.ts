import { Component } from '@angular/core';

interface Release {
  version: string;
  date: string;
  summary: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

@Component({
  selector: 'app-release-notes',
  template: `
    <section class="page-hero shell">
      <p class="eyebrow">Release notes</p>
      <h1>What changed in Mergentra.</h1>
      <p>Product updates, new capabilities, and fixes—organized by version, newest first.</p>
    </section>
    <div class="release-list shell">
      @for (release of releases; track release.version) {
        <article class="release-card">
          <div class="release-heading">
            <div>
              <p class="release-version">Version {{ release.version }}</p>
              <h2>{{ release.summary }}</h2>
            </div>
            <time>{{ release.date }}</time>
          </div>
          @if (release.added?.length) {
            <div class="release-group">
              <h3>Added</h3>
              <ul>
                @for (item of release.added; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </div>
          }
          @if (release.changed?.length) {
            <div class="release-group">
              <h3>Changed</h3>
              <ul>
                @for (item of release.changed; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </div>
          }
          @if (release.fixed?.length) {
            <div class="release-group">
              <h3>Fixed</h3>
              <ul>
                @for (item of release.fixed; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </div>
          }
        </article>
      }
    </div>
  `
})
export class ReleaseNotesComponent {
  protected readonly releases: Release[] = [
    {
      version: '1.3.1',
      date: 'November 3, 2026',
      summary: 'Dependency security updates and experimental build downloads',
      changed: [
        'The website now lists the experimental Linux (x64 and arm64) and Windows on ARM downloads, and has a new screenshot.'
      ],
      fixed: ['Updated build dependencies (minimatch 11.0.1) so no known security alerts remain.']
    },
    {
      version: '1.3.0',
      date: 'November 2, 2026',
      summary: 'Branch names on hover, a calmer large-repository warning, and a freeze fix',
      added: [
        'Hover a branch line to see its name and note; merged-in branches are named from their merge. Turn it off in Settings.',
        'The large repository warning is an in-app dialog that matches the dark theme.'
      ],
      changed: ['The permanent "Branch diverges" label above branch points was removed.'],
      fixed: [
        'Selecting a merge commit in a large repository no longer freezes the window.',
        'Hovering a merged-in branch no longer shows the name of the branch it merged into.',
        'Updated dependencies to resolve security alerts, including Electron 44.10.1.'
      ]
    },
    {
      version: '1.2.0',
      date: 'November 2, 2026',
      summary: 'Deeper history tools, plus experimental Linux and Windows on ARM builds',
      added: [
        'Commit search by message, author, hash, date, and reference or tag names.',
        'Read-only commit diff viewer, file history with rename following, and blame view.',
        'Read-only Stashes and Reflog panels, and a Branch health report.',
        'Explanations for shallow and missing-object history boundaries, and a summary popover for compacted commits.',
        'A local Fetch guard log in Settings.',
        'Experimental Linux builds (AppImage, deb, rpm) for x64 and arm64.',
        'Experimental Windows on ARM installer, portable, and MSI builds.'
      ],
      changed: [
        'The updater picks the file that matches your architecture, and package-manager installs on Linux leave updating to the package manager.'
      ]
    },
    {
      version: '1.1.0',
      date: 'November 2, 2026',
      summary: 'Clearer branch lanes and safer repository opening',
      added: [
        'Cancel opening a repository, with a confirmation for repositories that have very many branches.',
        'Neighbouring lanes are recoloured by hue, saturation, and lightness to stay distinct.'
      ],
      changed: [
        'Each merged-in branch gets its own lane, so branches no longer overlap or share a colour.',
        'Merge lines curve directly into the merge commit.',
        'Branches are ordered and coloured by how recently their tip was committed.'
      ]
    },
    {
      version: '1.0.0',
      date: 'October 18, 2026',
      summary: 'The first stable public release',
      added: [
        'Target branch selection with inferred parent paths through main.',
        'Straight branch lanes with curved connectors between branches.',
        'Dotted continuation lanes for visible parent branches with no later commits.',
        'Per-branch notes and editable branch colors.',
        'Windows NSIS, portable, and x64 MSI packages.'
      ],
      changed: [
        'Commit labels show hashes only.',
        'Target views hide unrelated histories while preserving the selected parent chain.',
        'Calendar-bounded custom time navigation.'
      ]
    },
    {
      version: '0.11.0',
      date: 'October 9, 2026',
      summary: 'Scale, updates, licensing, and managed installs',
      added: [
        'Render-cost measurement for histories up to 1,000,000 commits.',
        'Automatic weekly update checks and an update dialog.',
        'Versioned license agreement acceptance.',
        'Per-machine x64 MSI build target.'
      ],
      fixed: ['Improved graph interaction and test reliability around large histories.']
    },
    {
      version: '0.10.0',
      date: 'October 2026',
      summary: 'Clone, navigation, and repository controls',
      added: [
        'Clone over HTTPS or SSH with a History only option.',
        'Open and Clone tabs, graph panning, time-range dragging, and branch context filters.',
        'Editable recent repository names and repository notes.'
      ],
      changed: ['Improved layout, settings, themes, zoom controls, and review details.']
    },
    {
      version: '0.9.0',
      date: 'October 2026',
      summary: 'First public release',
      added: ['The initial Mergentra desktop application for exploring local Git history.']
    }
  ];
}
