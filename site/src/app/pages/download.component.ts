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
        <p class="checksum">
          <span>SHA-256</span>
          <code>90cbad41b962f5abd08e1d2ce0535c75f25d4c5e75457e8f23c1f489f4a7c364</code>
        </p>
      </article>
      <article class="download-card">
        <h2>Portable</h2>
        <p>Run Mergentra without an installation. Useful for temporary or managed environments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.0.0.0/Mergentra-1.0.0-Portable.exe"
          >Download Portable.exe <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>42e8edd1a5339bc97e26bc3079f96601dadf5a6f9a417ea63cd29a71b0d0ca33</code>
        </p>
      </article>
      <article class="download-card">
        <h2>MSI deployment</h2>
        <p>Use the x64 MSI for managed or per-machine Windows deployments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.0.0.0/Mergentra-1.0.0-x64.msi"
          >Download x64.msi <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>6804f7ef5dfbaff5539d60e60f7312599fae9ae2a039d5a606e1000dd738d063</code>
        </p>
      </article>
    </section>
    <section class="shell download-details">
      <h2>Before you install</h2>
      <ul>
        <li>Windows is the supported and tested platform.</li>
        <li>Install Git for Windows separately; Mergentra uses your installed Git.</li>
        <li>The packages are currently unsigned, so Windows SmartScreen may show a warning.</li>
        <li>Compare the downloaded file's SHA-256 value with the checksum shown above.</li>
        <li>
          Read the complete
          <a href="https://github.com/dgooderi/Mergentra/releases/tag/v1.0.0.0"
            >release notes on GitHub</a
          >.
        </li>
      </ul>
    </section>
  `
})
export class DownloadComponent {}
