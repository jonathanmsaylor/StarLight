import type { Tool } from './Types';

export function bindUI(
  setTool: (t:Tool)=>void,
  onSave: ()=>void,
  onLoad: ()=>boolean,
  readTime: ()=>string
) {
  const toast = document.getElementById('toast') as HTMLDivElement;
  const clock = document.getElementById('clock') as HTMLDivElement;

  // ---- Build bubble menu ----
  const root = document.getElementById('menu-root')!;
  root.classList.add('menu-root');

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.setAttribute('aria-expanded', 'false');
  fab.title = 'Menu';
  fab.textContent = '☰';

  const panel = document.createElement('div');
  panel.className = 'menu-panel';

  // Tool buttons (keep the same IDs so other code doesn’t change)
  const btnPlant   = mkBtn('tool-plant',   '🌱 Plant');
  const btnHarvest = mkBtn('tool-harvest', '🧺 Harvest');
  const btnPlow    = mkBtn('tool-plow',    '🪓 Plow');
  const btnSave    = mkBtn('tool-save',    '💾 Save');
  const btnLoad    = mkBtn('tool-load',    '📂 Load');

  panel.append(btnPlant, btnHarvest, btnPlow, btnSave, btnLoad);
  root.append(panel, fab);

  // Toggle panel open/closed
  const toggle = () => {
    const open = panel.classList.toggle('open');
    fab.setAttribute('aria-expanded', String(open));
  };
  fab.addEventListener('click', toggle);

  // Close when tapping outside
  window.addEventListener('pointerdown', (e) => {
    if (!panel.classList.contains('open')) return;
    if (root.contains(e.target as Node)) return;
    panel.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  });

  // Selection styling helper
  function press(active: HTMLButtonElement) {
    [btnPlant, btnHarvest, btnPlow].forEach(b => b.setAttribute('aria-pressed', 'false'));
    active.setAttribute('aria-pressed', 'true');
  }
  // Default tool
  btnPlant.setAttribute('aria-pressed', 'true');

  // Wire actions
  btnPlant.addEventListener('click',   () => { setTool('plant');   press(btnPlant);   });
  btnHarvest.addEventListener('click', () => { setTool('harvest'); press(btnHarvest); });
  btnPlow.addEventListener('click',    () => { setTool('plow');    press(btnPlow);    });

  btnSave.addEventListener('click', () => { onSave(); show('Game saved'); });
  btnLoad.addEventListener('click', () => {
    const ok = onLoad();
    show(ok ? 'Save loaded' : 'No save found');
  });

  // Toast + clock loop (unchanged behavior)
  function show(msg: string) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1200);
  }
  function tickClock() {
    clock.textContent = readTime();
    requestAnimationFrame(tickClock);
  }
  tickClock();

  // ---- helpers ----
  function mkBtn(id: string, label: string) {
    const b = document.createElement('button');
    b.id = id;
    b.className = 'menu-btn';
    b.setAttribute('aria-pressed', 'false');
    b.textContent = label;
    return b as HTMLButtonElement;
  }
}
