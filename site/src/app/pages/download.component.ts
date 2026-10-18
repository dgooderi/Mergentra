import { Component } from '@angular/core';

@Component({
  selector: 'app-download',
  template: `
    <section class="page-hero shell">
      <p class="eyebrow">Download Mergentra</p>
      <h1>A clearer way to explore Git history.</h1>
      <p>
        Mergentra is a Windows desktop application. Your repository stays on your machine; Git for
        Windows is required.
      </p>
    </section>
    <section class="shell download-grid">
      <article class="download-card featured">
        <p class="eyebrow">Recommended</p>
        <h2>Windows Setup</h2>
        <p>Install Mergentra for the current Windows user with Start menu and desktop shortcuts.</p>
        <a
          class="button button-primary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.0.0.0/Mergentra-1.0.0-Setup.exe"
          >Download Setup.exe <span aria-hidden="true">↓</span></a
        >
      </article>
      <article class="download-card">
        <h2>Portable</h2>
        <p>Run Mergentra without an installation. Useful for temporary or managed environments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.0.0.0/Mergentra-1.0.0-Portable.exe"
          >Download Portable.exe <span aria-hidden="true">↓</span></a
        >
      </article>
      <article class="download-card">
        <h2>MSI deployment</h2>
        <p>Use the x64 MSI for managed or per-machine Windows deployments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.0.0.0/Mergentra-1.0.0-x64.msi"
          >Download x64.msi <span aria-hidden="true">↓</span></a
        >
      </article>
    </section>
    <section class="shell download-details">
      <h2>Before you install</h2>
      <ul>
        <li>Windows is the supported and tested platform.</li>
        <li>Install Git for Windows separately; Mergentra uses your installed Git.</li>
        <li>The packages are currently unsigned, so Windows SmartScreen may show a warning.</li>
        <li>
          Read the complete
          <a href="https://github.com/dgooderi/Mergentra/releases/tag/v1.0.0.0"
            >release notes on GitHub</a
          >.
        </li>
      </ul>
    </section>
  `,
})
export class DownloadComponent {}
