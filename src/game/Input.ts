import type { World } from './World';
import type { Tool } from './Types';

export function bindInput(world: World, gridState: any, onAction: (tool:Tool, x:number, y:number)=>void) {
  const dom = world.renderer.domElement;

  let isPanning = false;
  let lastX = 0, lastY = 0;
  let pinchDist = 0;
  let pointers: PointerEvent[] = [];

  const onPointerDown = (e: PointerEvent) => {
    dom.setPointerCapture(e.pointerId);
    pointers.push(e);
    if (pointers.length === 1) {
      lastX = e.clientX; lastY = e.clientY;
      isPanning = false; // will become true on move threshold
    } else if (pointers.length === 2) {
      pinchDist = dist(pointers[0], pointers[1]);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    pointers = pointers.map(p => p.pointerId === e.pointerId ? e : p);
    if (pointers.length === 1) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (!isPanning && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) isPanning = true;
      if (isPanning) {
        pan(world, dx, dy);
        lastX = e.clientX; lastY = e.clientY;
      } else {
        // hover highlight
        const p = world.screenToWorld(e.clientX, e.clientY);
        if (p) {
          const t = world.grid.worldToTile(p);
          if (t) world.grid.setHighlight(t.x, t.y);
          else world.grid.hideHighlight();
        }
      }
    } else if (pointers.length === 2) {
      const d = dist(pointers[0], pointers[1]);
      const dd = d - pinchDist;
      pinchDist = d;
      zoom(world, dd * 0.005);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    dom.releasePointerCapture(e.pointerId);
    const before = pointers.slice();
    pointers = pointers.filter(p => p.pointerId != e.pointerId);

    if (before.length === 1 && !isPanning) {
      // Treat as tap
      const p = world.screenToWorld(e.clientX, e.clientY);
      if (p) {
        const t = world.grid.worldToTile(p);
        if (t) {
          onAction(world.tool, t.x, t.y);
        }
      }
    }
    isPanning = false;
  };

  dom.addEventListener('pointerdown', onPointerDown, { passive: true } as any);
  dom.addEventListener('pointermove', onPointerMove, { passive: true } as any);
  dom.addEventListener('pointerup', onPointerUp, { passive: true } as any);
  dom.addEventListener('pointercancel', onPointerUp, { passive: true } as any);
}

function dist(a: PointerEvent, b: PointerEvent) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function pan(world: World, dx: number, dy: number) {
  // pan camera parallel to ground plane
  const s = 0.005 * (world.camera.position.y * 0.6);
  world.camera.position.x -= dx * s;
  world.camera.position.z += dy * s;
}

function zoom(world: World, delta: number) {
  const ny = Math.min(22, Math.max(6, world.camera.position.y - delta * 8));
  const scale = ny / world.camera.position.y;
  world.camera.position.y = ny;
  world.camera.position.x *= scale;
  world.camera.position.z *= scale;
}
