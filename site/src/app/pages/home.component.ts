import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'app-home',
  template: `
    <section class="hero shell">
      <div class="hero-copy">
        <p class="eyebrow">
          <span class="status-dot"></span> Mergentra 1.0 is available for Windows
        </p>
        <h1>See your Git history <em>clearly.</em></h1>
        <p class="hero-text">
          Mergentra is a Windows GitHub and Git history visualizer that turns busy repositories into
          an interactive branch graph.
        </p>
        <div class="hero-actions">
          <a class="button button-primary" routerLink="/download"
            >Download for Windows <span aria-hidden="true">↓</span></a
          >
          <a class="button button-secondary" routerLink="/documentation"
            >Explore the documentation <span aria-hidden="true">→</span></a
          >
        </div>
        <p class="hero-note">Free to download. Requires Git for Windows.</p>
      </div>
      <div class="hero-art" aria-label="Stylized illustration of a branching Git history">
        <div class="graph-card">
          <div class="graph-card-bar">
            <span></span><span></span><span></span><b>repository / mergentra</b>
          </div>
          <svg viewBox="0 0 520 330" role="img" aria-label="Colorful branch graph">
            <path class="line main-line" d="M74 35 C74 86 74 116 74 285" />
            <path class="line blue-line" d="M74 88 C145 88 145 156 218 156 L438 156" />
            <path class="line pink-line" d="M74 137 C170 137 170 223 278 223 L438 223" />
            <path class="line gold-line" d="M218 156 C270 156 270 84 345 84 L438 84" />
            <path class="line green-line" d="M278 223 C335 223 335 278 438 278" />
            <g class="commit commit-main">
              <circle cx="74" cy="35" r="8" />
              <circle cx="74" cy="88" r="8" />
              <circle cx="74" cy="137" r="8" />
              <circle cx="74" cy="190" r="8" />
              <circle cx="74" cy="242" r="8" />
              <circle cx="74" cy="285" r="8" />
            </g>
            <g class="commit commit-blue">
              <circle cx="218" cy="156" r="8" />
              <circle cx="345" cy="84" r="8" />
              <circle cx="438" cy="156" r="8" />
            </g>
            <g class="commit commit-pink">
              <circle cx="278" cy="223" r="8" />
              <circle cx="438" cy="223" r="8" />
            </g>
            <g class="commit commit-green"><circle cx="438" cy="278" r="8" /></g>
            <text x="96" y="40">main</text>
            <text x="238" y="151">feature/login</text>
            <text x="298" y="218">feature/search</text>
          </svg>
        </div>
      </div>
    </section>

    <section class="section shell">
      <div class="section-heading">
        <p class="eyebrow">Understand the shape of change</p>
        <h2>A better view of branches and merges.</h2>
        <p>
          Git history is full of useful information. Mergentra puts the relationships back in view
          without making you read a wall of hashes.
        </p>
      </div>
      <div class="feature-grid">
        <article class="feature-card">
          <span class="feature-icon">⌘</span>
          <h3>Follow any branch</h3>
          <p>Select a target branch and trace its inferred parent chain through the main line.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">⤢</span>
          <h3>Make merges legible</h3>
          <p>
            Straight branch lanes and curved connectors show where work diverged and came back
            together.
          </p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">◌</span>
          <h3>Explore at your pace</h3>
          <p>Filter references, move through time, zoom the graph, and inspect commit details.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">✦</span>
          <h3>Make it yours</h3>
          <p>Give branches useful colors and personal notes so the history makes sense to you.</p>
        </article>
      </div>
    </section>

    <section class="section shell split-section">
      <div class="split-copy">
        <p class="eyebrow">Designed for real repositories</p>
        <h2>Your repository stays on your machine.</h2>
        <p>
          Mergentra is a Windows desktop application. It reads the local Git repository you choose
          and never turns your source code into a web upload.
        </p>
        <ul class="check-list">
          <li>Open local clones, including large and busy histories.</li>
          <li>Inspect branches, tags, worktrees, merges, and commit details.</li>
          <li>Fetch only when you explicitly choose Fetch.</li>
          <li>Keep notes and branch colors in local application storage.</li>
        </ul>
      </div>
      <figure class="screenshot-frame">
        <img
          src="assets/mergentra-current.png"
          alt="Mergentra showing a current target branch graph and Review panel"
          loading="lazy"
        />
        <figcaption>A clear visual map for complicated Git history.</figcaption>
      </figure>
    </section>

    <section class="download-section">
      <div class="shell download-inner">
        <div>
          <p class="eyebrow">Start exploring</p>
          <h2>Make Git history make sense.</h2>
          <p>Mergentra 1.0 is free to download for Windows. Git for Windows is required.</p>
        </div>
        <a class="button button-primary" routerLink="/download"
          >View downloads <span aria-hidden="true">→</span></a
        >
      </div>
    </section>
  `,
})
export class HomeComponent {}
