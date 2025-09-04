import type { Tool } from './Types';

export function bindUI(
  setTool: (t: Tool) => void
) {
  const root = document.getElementById('menu-root')!;
  root.classList.add('menu-root');

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.setAttribute('aria-expanded', 'false');
  fab.title = 'Menu';
  fab.textContent = '☰';

  const panel = document.createElement('div');
  panel.className = 'menu-panel';

  // Only PLANT tool
  const btnPlant = mkBtn('tool-plant', '🌱 Plant');
  btnPlant.setAttribute('aria-pressed', 'true'); // default selected
  panel.append(btnPlant);

  root.append(panel, fab);

  const toggle = () => {
    const open = panel.classList.toggle('open');
    fab.setAttribute('aria-expanded', String(open));
  };
  fab.addEventListener('click', toggle);

  window.addEventListener('pointerdown', (e) => {
    if (!panel.classList.contains('open')) return;
    if (root.contains(e.target as Node)) return;
    panel.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
  });

  btnPlant.addEventListener('click', () => {
    setTool('plant');
    btnPlant.setAttribute('aria-pressed', 'true');
  });

  function mkBtn(id: string, label: string) {
    const b = document.createElement('button');
    b.id = id;
    b.className = 'menu-btn';
    b.setAttribute('aria-pressed', 'false');
    b.textContent = label;
    return b as HTMLButtonElement;
  }
}
