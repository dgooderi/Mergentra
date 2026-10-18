import { Component } from '@angular/core';

@Component({
  selector: 'app-documentation',
  template: `
    <section class="page-hero shell">
      <p class="eyebrow">Documentation</p>
      <h1>Understand your repository.</h1>
      <p>
        Learn how Mergentra reads Git history and how to use the graph to answer questions about
        branches, merges, and change.
      </p>
    </section>
    <div class="docs-layout shell">
      <aside class="docs-nav" aria-label="Documentation sections">
        <a href="#getting-started">Getting started</a
        ><a href="#reading-the-graph">Reading the graph</a
        ><a href="#target-branches">Target branches and filters</a
        ><a href="#notes-colors">Notes and branch colors</a
        ><a href="#time-navigation">Time navigation</a><a href="#clone-fetch">Clone and Fetch</a
        ><a href="#security">Security and troubleshooting</a>
      </aside>
      <article class="docs-content">
        <section id="getting-started">
          <h2>Getting started</h2>
          <p>
            Install Mergentra for Windows, install Git for Windows, and open a local repository.
            Mergentra reads the repository history without changing commits, branches, or files.
          </p>
          <ol>
            <li>Download the Setup installer or Portable build.</li>
            <li>Install Git for Windows if it is not already installed.</li>
            <li>Choose a repository folder on the opening screen.</li>
            <li>Wait for the history to load, then explore the graph.</li>
          </ol>
        </section>
        <section id="reading-the-graph">
          <h2>Reading the graph</h2>
          <p>
            Each horizontal lane represents a branch reference. Commits show their hashes, while
            curved connectors make branch divergence and merge relationships visible. Tags,
            worktrees, and the checked-out branch are shown alongside the graph.
          </p>
          <p>
            Git does not record the moment a branch was created. Mergentra infers divergence from
            shared history and labels the result clearly.
          </p>
        </section>
        <section id="target-branches">
          <h2>Target branches and filters</h2>
          <p>
            Use the Target branch picker to focus on a branch and its inferred parent chain through
            <code>main</code>. When a parent has no later commits, Mergentra shows a dotted
            continuation so the branch relationship keeps its position.
          </p>
          <p>
            Reference checkboxes let you show or hide local branches and remote-tracking references
            independently. The underlying repository is never changed.
          </p>
        </section>
        <section id="notes-colors">
          <h2>Personal notes and branch colors</h2>
          <p>
            Open the References picker to add a personal note or change a branch color. You can also
            click a branch line in the graph to select its color control. Notes and color choices
            are stored locally for the repository and are not shared with anyone.
          </p>
        </section>
        <section id="time-navigation">
          <h2>Time navigation</h2>
          <p>
            Use the time-range controls to inspect all history, rolling periods, or a custom
            calendar range. Commits outside the selected window are clipped and continuation markers
            show where history continues.
          </p>
        </section>
        <section id="clone-fetch">
          <h2>Clone and Fetch</h2>
          <p>
            Clone a repository over HTTPS or SSH into a new or empty folder. The optional History
            only mode skips file contents. Fetch is always explicit; opening and filtering a
            repository never fetches automatically.
          </p>
        </section>
        <section id="security">
          <h2>Security and troubleshooting</h2>
          <p>
            Mergentra runs Git locally and treats repository configuration as untrusted. Fetch
            operations are guarded against repository settings that could execute unexpected
            programs. Opening a repository reads history only.
          </p>
          <p>
            If Git is not on <code>PATH</code>, enter the full path to <code>git.exe</code> in
            Settings. For large repositories, allow the initial history scan time to complete before
            filtering.
          </p>
        </section>
      </article>
    </div>
  `,
})
export class DocumentationComponent {}
