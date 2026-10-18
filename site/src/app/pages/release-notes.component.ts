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
