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
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.2.0/Mergentra-1.2.0-Setup.exe"
          >Download Setup.exe <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>96469500f78bb1ea10faf9e3419057bfa7da933d1f525a257957c894f4dbc084</code>
        </p>
      </article>
      <article class="download-card">
        <h2>Portable</h2>
        <p>Run Mergentra without an installation. Useful for temporary or managed environments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.2.0/Mergentra-1.2.0-Portable.exe"
          >Download Portable.exe <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>37cf158af515dcd3f2d81ad74fe5de6f7ff5d4cd3b50694ed1361d54d11d001a</code>
        </p>
      </article>
      <article class="download-card">
        <h2>MSI deployment</h2>
        <p>Use the x64 MSI for managed or per-machine Windows deployments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.2.0/Mergentra-1.2.0-x64.msi"
          >Download x64.msi <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>0a843d56d95b2f6e66174daf7ee274323e046f8b595986f631d07df28bdc4729</code>
        </p>
      </article>
    </section>
    <section class="shell download-details">
      <h2>Before you install</h2>
      <ul>
        <li>Windows is the supported and tested platform.</li>
        <li>
          Experimental Linux (x64 and arm64) and Windows on ARM builds are on the
          <a href="https://github.com/dgooderi/Mergentra/releases/tag/v1.2.0">release page</a>. They
          have not been tested on real hardware.
        </li>
        <li>Install Git for Windows separately; Mergentra uses your installed Git.</li>
        <li>The packages are currently unsigned, so Windows SmartScreen may show a warning.</li>
        <li>Compare the downloaded file's SHA-256 value with the checksum shown above.</li>
        <li>
          Read the complete
          <a href="https://github.com/dgooderi/Mergentra/releases/tag/v1.2.0"
            >release notes on GitHub</a
          >.
        </li>
      </ul>
    </section>
  `
})
export class DownloadComponent {}
