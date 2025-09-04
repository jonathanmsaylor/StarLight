# Farm Sim Mobile — Starter (Vite + TypeScript + Three.js)

A minimal, **mobile-first** 3D farming sim scaffold:
- Touch controls: tap to plant/harvest/plow, 2‑finger pinch to zoom, 1‑finger drag to pan
- 12×12 tile grid with simple crop growth (4 stages) and localStorage save/load
- Day/night cycle with ambient/directional light
- PWA manifest + very basic service worker for offline play

> This is meant as a clean, rock-solid starting point. From here we’ll add inventory, tools, crop types, soil quality, crafting, weather, NPCs, etc.

---

## Quick Start

1) **Install Node 18+**  
2) In terminal:
```bash
npm install
npm run dev
```
3) Open the printed **Local** URL on your phone (same Wi‑Fi) or on desktop.  
4) Tap `🌱 Plant` and then tap a tile. Watch crops grow through 4 stages. Save/Load via buttons.

To build for production:
```bash
npm run build
npm run preview
```

---

## Controls

- **Tap**: perform current tool action on tile (Plant / Harvest / Plow)
- **Drag (1 finger)**: pan the camera
- **Pinch (2 fingers)**: zoom in/out

---

## Code Map

```
src/
  main.ts                # boots the world, binds UI + input, gameloop
  game/
    World.ts             # scene, camera, lights, crop logic, time
    Grid.ts              # tile grid helpers + highlight
    Input.ts             # touch/pointer gestures (tap, pan, pinch)
    UI.ts                # HUD buttons + clock + toasts
    Save.ts              # localStorage save/load
    Types.ts             # shared types
public/
  manifest.webmanifest   # PWA metadata
  sw.js                  # minimal caching for offline
```

---

## Next Up (suggested roadmap)

- Inventory & seed counts; XP & leveling
- Multiple crop types w/ different growth curves
- Soil moisture + watering can (hydration system)
- Tool wheel + haptics feedback on mobile
- Crafting bench & storage chests
- Region chunks + world streaming for larger maps
- Save versioning & cloud sync
- UI scale/contrast settings for accessibility

---

## License

MIT — use this freely in your projects.
