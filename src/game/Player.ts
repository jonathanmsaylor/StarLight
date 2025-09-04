import * as THREE from 'three';

export class Player {
  public group = new THREE.Group();
  public speed = 3.2; // tiles per second-ish
  private _mesh: THREE.Mesh;
  private _glow: THREE.Sprite;

  constructor() {
    // Star core (icosahedron) with warm emissive
    const geo = new THREE.IcosahedronGeometry(0.28, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xFFF1A8,
      emissive: 0xFFD34D,
      emissiveIntensity: 1.8,
      roughness: 0.4,
      metalness: 0.0
    });
    this._mesh = new THREE.Mesh(geo, mat);
    this._mesh.castShadow = false;
    this.group.add(this._mesh);

    // Soft glow sprite
    const glowTex = Player._makeGlowTexture();
    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this._glow = new THREE.Sprite(spriteMat);
    this._glow.scale.set(1.4, 1.4, 1.4);
    this.group.add(this._glow);
  }

  // gentle pulse
  updateGlow(t: number) {
    const s = 1.35 + Math.sin(t * 2.2) * 0.08;
    this._glow.scale.set(s, s, s);
  }

  // Radial gradient canvas texture
  static _makeGlowTexture(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0, 'rgba(255,227,120,1)');
    g.addColorStop(0.5, 'rgba(255,200,80,0.55)');
    g.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,size,size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
