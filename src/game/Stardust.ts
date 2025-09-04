import * as THREE from 'three';

interface P {
  life: number;
  maxLife: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
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

    // ✅ Prevent vanishing due to frustum culling
    this.points.frustumCulled = false;
    this.geom.computeBoundingSphere();
  }

  spawn(x:number, y:number, z:number) {
    let p: P | undefined = this.particles.find(pp => pp.life <= 0);
    if (!p) {
      if (this.particles.length >= this.max) return;
      p = { life: 0, maxLife: 0.6, x, y, z, vx:0,vy:0,vz:0 };
      this.particles.push(p);
    }
    p.x = x; p.y = y; p.z = z;
    p.vx = (Math.random()-0.5) * 0.4;
    p.vy = Math.random() * 0.4;
    p.vz = (Math.random()-0.5) * 0.4;
    p.maxLife = 0.6 + Math.random()*0.4;
    p.life = p.maxLife;
  }

  update(dt:number) {
    const warm = [1.0, 0.86, 0.45];
    for (let i=0;i<this.particles.length;i++) {
      const p = this.particles[i];
      if (p.life <= 0) { this.alpha[i] = 0; continue; }
      p.life -= dt;
      p.vy -= 0.6 * dt; // slight gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const t = Math.max(0, p.life / p.maxLife);
      const idx = i*3;
      this.pos[idx] = p.x; this.pos[idx+1] = p.y; this.pos[idx+2] = p.z;
      this.color[idx] = warm[0]; this.color[idx+1] = warm[1]; this.color[idx+2] = warm[2];
      this.alpha[i] = t*t; // fade
    }
    (this.geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Keep bounding sphere valid (safe even if culling is disabled)
    this.geom.computeBoundingSphere();
  }
}
