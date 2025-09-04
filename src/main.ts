import { World } from './game/World';
import { bindInput } from './game/Input';
import { bindUI } from './game/UI';
import { saveGame, loadGame } from './game/Save';
import type { Tool, TileState } from './game/Types';

const app = document.getElementById('app')!;
const world = new World(app);

// Initialize grid state from world grid
let gridState: TileState[][] = world.grid.tiles;

// Restore if save exists
const loaded = loadGame();
if (loaded) {
  gridState = loaded.grid;
  world.day = loaded.day;
  world.minutes = loaded.minutes;
}

// UI
function setTool(t: Tool) { world.tool = t; }
function onSave() { saveGame(gridState, world.day, world.minutes); }
function onLoad() {
  const data = loadGame();
  if (!data) return false;
  gridState = data.grid;
  world.day = data.day;
  world.minutes = data.minutes;
  world.updateCropsVisuals(gridState);
  return true;
}
function readTime(): string {
  const h = Math.floor(world.minutes / 60);
  const m = Math.floor(world.minutes % 60);
  const hh = String(h).padStart(2,'0');
  const mm = String(m).padStart(2,'0');
  return `Day ${world.day} • ${hh}:${mm}`;
}
bindUI(setTool, onSave, onLoad, readTime);

// Input
bindInput(world, gridState, (tool, x, y) => {
  const tile = gridState[y][x];
  let ok = false;
  if (tool === 'plant') ok = world.plant(x,y, tile);
  if (tool === 'harvest') ok = world.harvest(x,y, tile);
  if (tool === 'plow') ok = world.plow(x,y, tile);
});

// Game loop
function loop() {
  world.tick(gridState);
  requestAnimationFrame(loop);
}
loop();

// PWA service worker registration (simple)
if ('serviceWorker' in navigator) {
  // Build an asset list by probing current scripts/styles (very naive)
  const assets = Array.from(document.querySelectorAll('link[rel=stylesheet],script[type=module],link[rel=manifest]'))
    .map(n => (n as HTMLLinkElement).href || (n as HTMLScriptElement).src)
    .filter(Boolean);

  fetch('/sw.js?assets')
    .then(() => navigator.serviceWorker.register('/sw.js'))
    .then(reg => {
      // pass assets (not standard; used by our sw) via postMessage after activate
      if (reg.active) reg.active.postMessage({ type: 'ASSETS', assets });
      navigator.serviceWorker.addEventListener('message', (ev) => {
        // no-op
      })
    })
    .catch(() => {});
}
