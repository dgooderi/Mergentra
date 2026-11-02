import { Component } from '@angular/core';

@Component({
  selector: 'app-download',
  template: `
    <section class="page-hero shell">
      <p class="eyebrow">Download Mergentra</p>
      <h1>A clearer way to explore Git history.</h1>
      <p>
        Mergentra is a desktop application for Windows, with experimental Linux and Windows on ARM
        builds. Your repository stays on your machine; Git is required.
      </p>
    </section>
    <section class="shell download-grid">
      <article class="download-card featured">
        <p class="eyebrow">Recommended</p>
        <h2>Windows Setup</h2>
        <p>Install Mergentra for the current Windows user with Start menu and desktop shortcuts.</p>
        <a
          class="button button-primary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-Setup.exe"
          >Download Setup.exe <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>b20c3eecb3d0031860d7d2e5f9a77a23384ac5283b8402f26580329bf115b68a</code>
        </p>
      </article>
      <article class="download-card">
        <h2>Portable</h2>
        <p>Run Mergentra without an installation. Useful for temporary or managed environments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-Portable.exe"
          >Download Portable.exe <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>c24c8794653079aeae88e22434c27f7d1289eb92315f44cbdd400d692615b60f</code>
        </p>
      </article>
      <article class="download-card">
        <h2>MSI deployment</h2>
        <p>Use the x64 MSI for managed or per-machine Windows deployments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-x64.msi"
          >Download x64.msi <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>53968092e94d32457d54be2e735347da142790cf71f22b3ee7cb59ae73f461f7</code>
        </p>
      </article>
    </section>
    <section class="shell experimental">
      <p class="eyebrow">Experimental</p>
      <h2>Linux and Windows on ARM</h2>
      <p class="experimental-note">
        These builds are experimental. They are built from the same source, but I don't have the
        hardware or facilities to test them, so expect rough edges. Windows is the supported
        platform.
      </p>
      <p class="experimental-note">
        If you have the time to try one, I'd be grateful for your help. Please
        <a href="https://github.com/dgooderi/Mergentra/issues/new">log an issue on GitHub</a> with
        what you ran it on (distribution or Windows version, CPU architecture, and the file you
        used) and what worked or didn't. Reports that something works are useful too.
      </p>
      <div class="download-grid experimental-grid">
        <article class="download-card">
          <h3>Linux x64</h3>
          <ul class="file-list">
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-x86_64.AppImage"
                >AppImage</a
              >
              <code>4aeaccd7f882b29fd950543f98e097a0b9acd40b7abf66b14707020c263b9793</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-linux-amd64.deb"
                >.deb (Debian, Ubuntu)</a
              >
              <code>e9c71cba246e6cad0a42c455682cfcb606d97fe88c8c3aecb1552276086d206e</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-linux-x86_64.rpm"
                >.rpm (Fedora, openSUSE)</a
              >
              <code>88eca0eae6ce46d4e17669a0c6e994a8cb72a06ed30bd585206d687f076e7267</code>
            </li>
          </ul>
        </article>
        <article class="download-card">
          <h3>Linux arm64</h3>
          <ul class="file-list">
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-arm64.AppImage"
                >AppImage</a
              >
              <code>c8abab313311581c3164b7c08ed6c42e9875b071c8530b7857e3bab45819e84c</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-linux-arm64.deb"
                >.deb (Debian, Ubuntu)</a
              >
              <code>e4849082c9fa39171a735daa398d1febcd8fa4a10be9f1aa8658c4e3f5825927</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-linux-aarch64.rpm"
                >.rpm (Fedora, openSUSE)</a
              >
              <code>a0bc426d5c45a4752247cf878cf281b1467591fb52bcf931a334812c2814d0f4</code>
            </li>
          </ul>
        </article>
        <article class="download-card">
          <h3>Windows on ARM</h3>
          <ul class="file-list">
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-arm64-Setup.exe"
                >Setup.exe</a
              >
              <code>197c02df041a9fc3c5d7a0e1c2d34c36c4b5c93960a45710f1ce59a3fbe784b7</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-arm64-Portable.exe"
                >Portable.exe</a
              >
              <code>e0a02ac5d29025a1bdbc5a7002e5b72ff91ee7bb03be1159f186cf50fb3b79b3</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.1/Mergentra-1.3.1-arm64.msi"
                >arm64.msi</a
              >
              <code>fa0eeee06e164a67b029eac699b0d41aad83b9e36b9b3c0c2d0ce063232b4373</code>
            </li>
          </ul>
        </article>
      </div>
      <p class="experimental-note">
        Install the <code>.deb</code> or <code>.rpm</code> with your package manager; updates then
        come from it. To run the AppImage, make it executable with <code>chmod +x</code>. On Ubuntu
        24.04 and other distributions that restrict user namespaces, start it with
        <code>--no-sandbox</code>. Mergentra uses your installed <code>git</code>.
      </p>
    </section>
    <section class="shell download-details">
      <h2>Before you install</h2>
      <ul>
        <li>
          Windows x64 is the supported and tested platform. The Linux and Windows on ARM builds
          above are experimental and have not been tested on real hardware.
        </li>
        <li>Install Git for Windows separately; Mergentra uses your installed Git.</li>
        <li>The packages are currently unsigned, so Windows SmartScreen may show a warning.</li>
        <li>Compare the downloaded file's SHA-256 value with the checksum shown above.</li>
        <li>
          Read the complete
          <a href="https://github.com/dgooderi/Mergentra/releases/tag/v1.3.1"
            >release notes on GitHub</a
          >.
        </li>
      </ul>
    </section>
  `
})
export class DownloadComponent {}
