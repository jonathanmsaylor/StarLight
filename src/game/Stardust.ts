import * as THREE from 'three';

interface P {
  life: number;        // time left while airborne
  maxLife: number;     // initial airborne lifetime
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  grounded: boolean;   // did we touch the ground?
  groundLife: number;  // countdown after touching ground
  groundMax: number;   // initial ground countdown (for fade curve)
}

export class Stardust {
  public points: THREE.Points;
  private geom: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  private max = 400;
  private particles: P[] = [];
  private pos: Float32Array;
  private color: Float32Array;
  private alpha: Float32Array;

  // Ground plane (your field is y = 0). A tiny lift prevents z-fighting.
  private groundY = 0.01;

  constructor() {
    this.geom = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.color = new Float32Array(this.max * 3);
    this.alpha = new Float32Array(this.max);
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geom.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    this.geom.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));

    this.mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geom, this.mat);
    this.points.frustumCulled = false;
    this.geom.computeBoundingSphere();
  }

  spawn(x:number, y:number, z:number) {
    let p: P | undefined = this.particles.find(pp => pp.life <= 0 && pp.grounded === false && pp.groundLife <= 0);
    // If none free, allow reusing any fully expired particle (air or ground)
    if (!p) p = this.particles.find(pp => pp.life <= 0 && pp.groundLife <= 0);
    if (!p) {
      if (this.particles.length >= this.max) return;
      p = { life: 0, maxLife: 1.0, x, y, z, vx:0, vy:0, vz:0, grounded:false, groundLife:0, groundMax:0 };
      this.particles.push(p);
    }

    // Reset state
    p.x = x; p.y = y; p.z = z;
    p.vx = (Math.random()-0.5) * 0.4;
    p.vy = Math.random() * 0.4;
    p.vz = (Math.random()-0.5) * 0.4;

    // Airborne lifetime ~0.8–1.2s
    p.maxLife = 0.8 + Math.random()*0.4;
    p.life = p.maxLife;

    p.grounded = false;
    p.groundLife = 0;
    p.groundMax = 0;
  }

update(dt:number) {
  const warm = [1.0, 0.86, 0.45]; // base color

  for (let i = 0; i < this.particles.length; i++) {
    const p = this.particles[i];

    // If fully expired (air + ground), hide it and skip
    if (p.life <= 0 && p.groundLife <= 0) {
      this.alpha[i] = 0;
      const idx = i * 3;
      this.color[idx] = 0; this.color[idx+1] = 0; this.color[idx+2] = 0; // invisible in additive
      continue;
    }

    if (!p.grounded) {
      // Airborne
      p.life -= dt;
      p.vy -= 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Touch ground → start short evaporation
      if (p.y <= this.groundY) {
        p.y = this.groundY;
        p.grounded = true;
        p.groundMax = 0.30 + Math.random() * 0.15; // ~0.30–0.45s
        p.groundLife = p.groundMax;
        p.vy = 0;
        p.vx *= 0.25; p.vz *= 0.25;
      }
    } else {
      // Grounded: quick evaporate + slight settling
      p.groundLife -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.vx *= 0.86; p.vz *= 0.86;
    }

    // Fade factor:
    // - Airborne: t in [0..1] by life/maxLife
    // - Grounded: faster fade by groundLife/groundMax
    let a = 0;
    if (!p.grounded) {
      const t = Math.max(0, p.life / p.maxLife);
      a = t * t; // smoother
    } else {
      const tg = Math.max(0, p.groundLife / p.groundMax);
      a = tg * tg;
    }

    // Write buffers (color premultiplied by fade -> visually disappears)
    const idx = i * 3;
    this.pos[idx] = p.x; this.pos[idx+1] = p.y; this.pos[idx+2] = p.z;
    this.color[idx]     = warm[0] * a;
    this.color[idx + 1] = warm[1] * a;
    this.color[idx + 2] = warm[2] * a;
    this.alpha[i] = a; // kept for completeness, not used by material
  }

  (this.geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (this.geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;

  this.geom.computeBoundingSphere(); // safe even with culling off
}

}
