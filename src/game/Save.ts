import type { TileState } from './Types';

const KEY = 'farm-sim-save-v1';

export function saveGame(grid: TileState[][], day: number, minutes: number) {
  const data = {
    grid,
    day,
    minutes,
    ts: Date.now(),
  };
  localStorage.setItem(KEY, JSON.stringify(data));
  return data;
}

export function loadGame(): { grid: TileState[][], day: number, minutes: number } | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return { grid: data.grid, day: data.day, minutes: data.minutes };
  } catch {
    return null;
  }
}
