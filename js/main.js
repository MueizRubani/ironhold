// ============================================================
// IRONHOLD — entry point
// ============================================================
import { Game } from './game.js';

function showFatal(err) {
  console.error(err);
  const screen = document.getElementById('loading-screen');
  const status = document.getElementById('load-status');
  if (screen) screen.classList.remove('hidden');
  if (status) {
    status.textContent = 'The war table could not be raised.';
    status.style.color = '#d08d77';
  }
  const tip = document.getElementById('load-tip');
  if (tip) {
    tip.textContent = (err && err.message ? err.message : String(err)) +
      ' - try a hard refresh (Ctrl+F5). IRONHOLD needs WebGL and a modern browser.';
    tip.style.color = '#c8a98c';
    tip.style.maxWidth = '620px';
  }
  const out = document.createElement('pre');
  out.id = 'dev-out';
  out.textContent = 'FATAL ' + (err && err.stack ? err.stack : String(err));
  out.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:96vw;max-height:90vh;overflow:auto;background:#0b0906dd;color:#f0b7a3;font:12px/1.5 monospace;padding:12px;border:1px solid #8a6d3b;white-space:pre-wrap';
  document.body.appendChild(out);
}

async function start() {
  try {
    const game = new Game();
    window.game = game;
    await game.boot();
    const dev = new URLSearchParams(location.search).get('dev');
    if (dev) {
      // Loaded only for local headless checks; never requested during normal play.
      const { runDev } = await import(`./dev.js?v=${Date.now()}`);
      await runDev(game, dev);
    }
  } catch (err) {
    showFatal(err);
  }
}

start();
