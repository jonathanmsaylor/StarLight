import type { Tool } from './Types';

export function bindUI(setTool: (t:Tool)=>void, onSave: ()=>void, onLoad: ()=>void, readTime: ()=>string) {
  const btnPlant = document.getElementById('tool-plant') as HTMLButtonElement;
  const btnHarvest = document.getElementById('tool-harvest') as HTMLButtonElement;
  const btnPlow = document.getElementById('tool-plow') as HTMLButtonElement;
  const btnSave = document.getElementById('tool-save') as HTMLButtonElement;
  const btnLoad = document.getElementById('tool-load') as HTMLButtonElement;
  const toast = document.getElementById('toast') as HTMLDivElement;
  const clock = document.getElementById('clock') as HTMLDivElement;

  function press(btn: HTMLButtonElement) {
    [btnPlant, btnHarvest, btnPlow].forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
  }

  btnPlant?.addEventListener('click', () => { setTool('plant'); press(btnPlant); });
  btnHarvest?.addEventListener('click', () => { setTool('harvest'); press(btnHarvest); });
  btnPlow?.addEventListener('click', () => { setTool('plow'); press(btnPlow); });
  btnSave?.addEventListener('click', () => { onSave(); show('Game saved'); });
  btnLoad?.addEventListener('click', () => { const ok = onLoad(); show(ok ? 'Save loaded' : 'No save found'); });

  function show(msg: string) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1200);
  }

  // Update clock UI
  function tick() {
    clock.textContent = readTime();
    requestAnimationFrame(tick);
  }
  tick();
}
