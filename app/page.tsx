"use client";

import { useEffect } from "react";

export default function HomePage() {
  useEffect(() => {
    void import("../src/main");
  }, []);

  return (
    <main className="game-shell">
      <section className="game-frame" aria-label="Wildvault Run game">
        <canvas id="game" aria-label="Endless runner game canvas" />

        <div className="topbar" aria-live="polite">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true" />
            <span>Wildvault</span>
          </div>
          <div className="stat-cluster">
            <div className="stat">
              <span className="stat-label">Relics</span>
              <strong id="relics">0</strong>
            </div>
            <div className="stat">
              <span className="stat-label">Distance</span>
              <strong>
                <span id="distance">0</span>
                <small>m</small>
              </strong>
            </div>
          </div>
          <button id="sound-toggle" className="icon-button" type="button" aria-label="Toggle sound">
            <span aria-hidden="true">◖</span>
          </button>
        </div>

        <div id="start-panel" className="panel start-panel">
          <p className="eyebrow">The vault is waking</p>
          <h1>Outrun the wild.</h1>
          <p className="intro">
            Shift lanes, clear ancient traps, and carry every sun relic you can.
          </p>
          <button id="start-button" className="primary-button" type="button">
            Begin the run
            <span aria-hidden="true">→</span>
          </button>
          <div className="control-hints" aria-label="Keyboard controls">
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> Move
            </span>
            <span>
              <kbd>↑</kbd> Jump
            </span>
            <span>
              <kbd>↓</kbd> Slide
            </span>
          </div>
        </div>

        <div id="game-over-panel" className="panel game-over-panel" hidden>
          <p className="eyebrow">Run complete</p>
          <h2 id="final-distance">0m</h2>
          <p id="run-summary">The vault remembers every step.</p>
          <div className="result-row">
            <span>Relics found</span>
            <strong id="final-relics">0</strong>
          </div>
          <button id="restart-button" className="primary-button" type="button">
            Run again
            <span aria-hidden="true">↻</span>
          </button>
        </div>

        <div id="toast" className="toast" aria-live="assertive" />

        <div className="touch-controls" aria-label="Touch controls">
          <button data-action="left" type="button" aria-label="Move left">
            ←
          </button>
          <button data-action="jump" type="button" aria-label="Jump">
            ↑
          </button>
          <button data-action="slide" type="button" aria-label="Slide">
            ↓
          </button>
          <button data-action="right" type="button" aria-label="Move right">
            →
          </button>
        </div>

        <div className="run-meter" aria-hidden="true">
          <span id="run-meter-fill" />
        </div>
      </section>

      <footer>
        <span>© 2026 Wildvault</span>
        <span className="footer-separator">•</span>
        <a href="https://tin.computer" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" fill="#66DC9D" />
          </svg>
          Growth by Tin
        </a>
      </footer>
    </main>
  );
}
