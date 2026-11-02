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
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-Setup.exe"
          >Download Setup.exe <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>e4cc75d221c5a44b21575e8c0ebb572a15dc0da094023d334acf18cb5be75740</code>
        </p>
      </article>
      <article class="download-card">
        <h2>Portable</h2>
        <p>Run Mergentra without an installation. Useful for temporary or managed environments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-Portable.exe"
          >Download Portable.exe <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>6b730a792b30212ef8522ca643ddf62f067ac21339f39f2217fc9f11aab87bb1</code>
        </p>
      </article>
      <article class="download-card">
        <h2>MSI deployment</h2>
        <p>Use the x64 MSI for managed or per-machine Windows deployments.</p>
        <a
          class="button button-secondary"
          href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-x64.msi"
          >Download x64.msi <span aria-hidden="true">↓</span></a
        >
        <p class="checksum">
          <span>SHA-256</span>
          <code>ca177a9d16a03b295e1639a955f9bc776cf1a868e9f305a15a89caf57789cd61</code>
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
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-x86_64.AppImage"
                >AppImage</a
              >
              <code>1740247fe44a114c07099f3f7ad6986b75f8803901e9296a2d0daf54f629deaf</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-linux-amd64.deb"
                >.deb (Debian, Ubuntu)</a
              >
              <code>65a1c6565c19af4a24c85db30daa4348269718bdc34318fb3e11063c31d6e6ca</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-linux-x86_64.rpm"
                >.rpm (Fedora, openSUSE)</a
              >
              <code>304e0f5948d7d920deae7d570fbdeb4a296193290c5350b6e82e68d53733887a</code>
            </li>
          </ul>
        </article>
        <article class="download-card">
          <h3>Linux arm64</h3>
          <ul class="file-list">
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-arm64.AppImage"
                >AppImage</a
              >
              <code>43f119643545cafa65e883bc5c592c4e32888642daa64d568815df0b544378da</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-linux-arm64.deb"
                >.deb (Debian, Ubuntu)</a
              >
              <code>474d79854c23427586f0aaaa049fdb7d3e4eb791f49daae3eb7e0d6557669266</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-linux-aarch64.rpm"
                >.rpm (Fedora, openSUSE)</a
              >
              <code>ddba0f5016e211906c765b47d7e527a08785b9c2fa5eba07baec654d53f0aac3</code>
            </li>
          </ul>
        </article>
        <article class="download-card">
          <h3>Windows on ARM</h3>
          <ul class="file-list">
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-arm64-Setup.exe"
                >Setup.exe</a
              >
              <code>9f60814b3e06cf6418602c3eb827902a939d9d7091e5d9c71b8d29ad4079d46c</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-arm64-Portable.exe"
                >Portable.exe</a
              >
              <code>bffe86281832ef38d9f23484bcd081b11f3b9cd2a74d88089fe6668e63228a20</code>
            </li>
            <li>
              <a
                href="https://github.com/dgooderi/Mergentra/releases/download/v1.3.0/Mergentra-1.3.0-arm64.msi"
                >arm64.msi</a
              >
              <code>bf08a1b34a623d01d17f3a82fe9a0f6a578e2be23364736b804e0e6475272d8a</code>
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
          <a href="https://github.com/dgooderi/Mergentra/releases/tag/v1.3.0"
            >release notes on GitHub</a
          >.
        </li>
      </ul>
    </section>
  `
})
export class DownloadComponent {}
