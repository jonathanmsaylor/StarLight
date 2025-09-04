import * as THREE from 'three';
import type { World } from './World';
import type { Tool } from './Types';

// Desktop keys for testing
export const controls = { up:false, down:false, left:false, right:false };

// Simple on-screen joystick state
const joy = {
  active: false,
  base: null as HTMLDivElement | null,
  knob: null as HTMLDivElement | null,
  originX: 0,
  originY: 0,
  x: 0,   // -1..1 (left/right)
  y: 0    // -1..1 (forward/back) -- up is +1
};

function createJoystick() {
  if (joy.base) return;
  const base = document.createElement('div');
  const knob = document.createElement('div');

Object.assign(base.style, {
  position:'fixed',
  right:'26px',       // ⬅️ Left instead of right
  bottom:'26px',     // sits above screen edge
  width:'100px',     // medium size: comfortable but not oversized
  height:'100px',
  borderRadius:'999px',
  background:'rgba(255,255,255,0.06)',
  border:'1px solid rgba(255, 255, 255, 0.02)',
  touchAction:'none',
  zIndex:'9999'
});
Object.assign(knob.style, {
  position:'absolute',
  left:'50%',
  top:'50%',
  transform:'translate(-50%,-50%)',
  width:'48px',
  height:'48px',
  borderRadius:'999px',
  background:'rgba(255,255,255,0.18)',
  border:'1px solid rgba(255,255,255,0.25)'
});

  base.appendChild(knob);
  document.body.appendChild(base);
  joy.base = base; joy.knob = knob;

  const maxR = 44; // was 50 — adjust drag radius to match smaller size

  const posFromEvent = (e: Touch | PointerEvent) => {
    const rect = base.getBoundingClientRect();
    return {
      x: (e as PointerEvent).clientX - (rect.left + rect.width/2),
      y: (e as PointerEvent).clientY - (rect.top + rect.height/2)
    };
  };

  const apply = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(1, len / maxR);
    const nx = (len > 0 ? dx / len : 0) * clamped;
    const ny = (len > 0 ? dy / len : 0) * clamped;
    joy.x = nx;
    joy.y = -ny; // up = +1
    if (joy.knob) {
      joy.knob.style.transform =
        `translate(calc(-50% + ${nx*maxR}px), calc(-50% + ${ny*maxR}px))`;
    }
  };

  const clear = () => {
    joy.active = false; joy.x = 0; joy.y = 0;
    if (joy.knob) joy.knob.style.transform = 'translate(-50%,-50%)';
  };

  base.addEventListener('pointerdown', (e: PointerEvent) => {
    joy.active = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = posFromEvent(e);
    apply(p.x, p.y);
  }, { passive: true } as any);

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!joy.active) return;
    const p = posFromEvent(e);
    apply(p.x, p.y);
  }, { passive: true } as any);

  window.addEventListener('pointerup', () => clear(), { passive: true } as any);
}


export function bindInput(world: World, _gridState: any, onAction: (tool:Tool, x:number, y:number)=>void) {
  const dom = world.renderer.domElement;

  // Create joystick for mobile
  createJoystick();

  // Keyboard (desktop testing only)
  const set = (e: KeyboardEvent, v: boolean) => {
    if (e.repeat) return;
    switch (e.key.toLowerCase()) {
      case 'w': case 'arrowup':    controls.up = v;    break;
      case 's': case 'arrowdown':  controls.down = v;  break;
      case 'a': case 'arrowleft':  controls.left = v;  break;
      case 'd': case 'arrowright': controls.right = v; break;
    }
  };
  window.addEventListener('keydown', e => set(e, true));
  window.addEventListener('keyup',   e => set(e, false));

  // Tap to act (plant/harvest/plow)
  dom.addEventListener('pointerup', (e: PointerEvent) => {
    // Ignore taps that ended on the joystick area
    if (joy.active) return;
    const p = world.screenToWorld(e.clientX, e.clientY);
    if (!p) return;
    const t = world.grid.worldToTile(p);
    if (!t) return;
    onAction(world.tool, t.x, t.y);
  }, { passive: true } as any);

  // Optional hover highlight (desktop)
  dom.addEventListener('pointermove', (e: PointerEvent) => {
    const p = world.screenToWorld(e.clientX, e.clientY);
    if (p) {
      const t = world.grid.worldToTile(p);
      if (t) world.grid.setHighlight(t.x, t.y); else world.grid.hideHighlight();
    } else {
      world.grid.hideHighlight();
    }
  }, { passive: true } as any);
}

/**
 * Returns a camera-relative movement vector on the XZ plane.
 * - WASD: W = screen-up, A = screen-left, S = down, D = right
 * - Joystick: up = +y, left = -x (converted below)
 */
export function getMoveVector(world: World): THREE.Vector3 {
  // Keyboard intent
  const keyX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0); // right minus left
  const keyY = (controls.up ? 1 : 0) - (controls.down ? 1 : 0);    // up minus down (screen space)

  // Joystick intent (already in -1..1)
  const jx = joy.x;
  const jy = joy.y;

  // Combine (clamp magnitude to 1)
  let sx = keyX + jx;
  let sy = keyY + jy;
  const mag = Math.hypot(sx, sy);
  if (mag > 1) { sx /= mag; sy /= mag; }

  // Camera-relative basis on XZ plane
  const forward = new THREE.Vector3();
  world.camera.getWorldDirection(forward);
  forward.y = 0; forward.normalize();              // screen-up uses +forward
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize(); // right-hand

  // Map screen vector to world: x->right, y->forward
  const v = new THREE.Vector3();
  v.addScaledVector(right, sx);
  v.addScaledVector(forward, sy);
  // Keep on XZ only
  v.y = 0;
  return v.lengthSq() ? v.normalize() : v;
}
