import * as THREE from 'three';
import { Grid } from './Grid';
import type { TileState, Tool } from './Types';
import { Player } from './Player';
import { Stardust } from './Stardust';
import { getMoveVector } from './Input';

/* ====== Stardust Fertility constants (existing) ====== */
const FERTILITY_RADIUS_TILES = 0.6;
const FERTILITY_ADD_PER_TOUCH = 0.25;
const FERTILITY_DECAY_PER_SEC = 0.12;
const GROWTH_MULT_MIN = 1.00;
const GROWTH_MULT_MAX = 1.75;
const FERTILITY_TINT_COLOR = 0xFFD34D;
const FERTILITY_TINT_ALPHA_MAX = 0.15;
const NEAR_VIS_RADIUS_TILES = 2;
const DEBUG_FERTILITY_NUMBERS = false;

/* === Enable growth so fertility affects crops === */
const APPLY_GROWTH_TICK = true;

/* === Debug speed so you can SEE growth quickly === */
const DEBUG_FAST_GROWTH = true;
const BASE_STAGE_SECS = DEBUG_FAST_GROWTH ? 6 : (6 * 60); // 6s per stage for testing, else 6 min
const BASE_STAGE_MS = BASE_STAGE_SECS * 1000;

/* === Growth tuning === */
const GROWTH_RATE_MULT = 1.0;          // ← turn this up/down to change overall speed (e.g., 0.5 = slower, 2 = faster)

/* === Visual scale while growing (per stage) === */
const STAGE_BASE_SCALE  = [0.85, 0.90, 0.95, 1.00]; // starting scale at the beginning of each stage
const STAGE_SCALE_GAIN  = [0.15, 0.10, 0.37, 0.00]; // extra scale added across the stage as progress -> 1
// final scale = base + gain * progress; stage 3 stops at 1.00
/* === Tile fill targets (how wide the crop should be vs. tile) ===
   We lerp from START -> END within each stage. 1.0 means "exactly tile width".
*/
const STAGE_START_COVER = [0.20, 0.40, 0.65, 0.85]; // at stage start (diameter / tileSize)
const STAGE_END_COVER   = [0.40, 0.70, 0.90, 0.98]; // at stage end   (diameter / tileSize)
const TILE_FILL_SAFETY  = 0.98; // keep a hair inside the tile to avoid Z-fighting/overlap

/* ====== Planting rules ====== */
const PLANT_RANGE_TILES = 1.25; // must be within this distance from tile center

export class World {
  public scene = new THREE.Scene();
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public raycaster = new THREE.Raycaster();
  public mouse = new THREE.Vector2();
  public grid: Grid;

  public tool: Tool = 'plant';

  private _clock = new THREE.Clock();
  private _dirLight: THREE.DirectionalLight;
  private _ambient: THREE.AmbientLight;

  public player = new Player();
  private _trail = new Stardust();
  private _camOffset = new THREE.Vector3(6, 10, 8);

  // Fertility visuals
  private _fertilityGroup = new THREE.Group();
  private _fertilityOverlays = new Map<string, THREE.Mesh>();
  private _fertilityTextEls = new Map<string, HTMLDivElement>();

  // Seed indicator (visible when tool === 'plant')
  private _seedGroup = new THREE.Group();

  constructor(private container: HTMLElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Scene + Camera
    this.scene.background = new THREE.Color(0x0a0f17);
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 100);

    // Fixed lighting
    this._ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this._ambient);

    this._dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this._dirLight.position.set(8, 12, 6);
    this._dirLight.castShadow = false;
    this.scene.add(this._dirLight);

    // Grid
    this.grid = new Grid(12, 12, 1);
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        (this.grid.tiles[y][x] as TileState).fertility ??= 0;
      }
    }
    this.scene.add(this.grid.group);

    // Fertility overlays
    this._fertilityGroup.name = 'fertility';
    this._fertilityGroup.position.y = 0.004;
    this.scene.add(this._fertilityGroup);

    // Player
    this.player.group.position.copy(this.grid.tileCenter(6, 6)).add(new THREE.Vector3(0, 0.25, 0));
    this.scene.add(this.player.group);

    // Seed indicator (small rotating seed above the star)
    {
      const seedGeo = new THREE.CapsuleGeometry(0.06, 0.10, 4, 8);
      const seedMat = new THREE.MeshStandardMaterial({
        color: 0x9b6b3d,
        emissive: 0x332015,
        roughness: 0.6,
        metalness: 0.05
      });
      const seedMesh = new THREE.Mesh(seedGeo, seedMat);
      seedMesh.castShadow = false;
      this._seedGroup.add(seedMesh);
      this._seedGroup.position.set(0, 0.55, 0); // hover above star
      this.player.group.add(this._seedGroup);
      this._seedGroup.visible = true; // tool defaults to 'plant'
    }

    // Stardust trail
    this.scene.add(this._trail.points);

    // Camera follow
    this.camera.position.copy(this.player.group.position).add(this._camOffset);
    this.camera.lookAt(this.player.group.position);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  screenToWorld(x: number, y: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = -((y - rect.top) / rect.height) * 2 + 1;
    this.mouse.set(nx, ny);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObject(this.grid.plane, false)[0];
    return hit ? hit.point : null;
  }

  // ---- crop helpers (unchanged) ----
  private createCropMesh(stage: 0|1|2|3): THREE.Mesh {
    const heights = [0.05, 0.15, 0.28, 0.42];
    const colorByStage = [0x6b8f3e, 0x7da446, 0x9bbf56, 0xd6c36d];
    const g = new THREE.ConeGeometry(0.12 + stage*0.02, heights[stage], 6);
    const m = new THREE.MeshStandardMaterial({ color: colorByStage[stage], roughness: 0.9, metalness: 0 });
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }
  private cropKey(x:number,y:number) { return `crop-${x}-${y}`; }
  private getCropsGroup(): THREE.Group {
    const existing = this.scene.getObjectByName('crops') as THREE.Group;
    if (existing) return existing;
    const g = new THREE.Group(); g.name = 'crops'; this.scene.add(g); return g;
  }
  private findCropMesh(x:number,y:number): THREE.Object3D | undefined {
    return this.getCropsGroup().children.find(o => (o as any).userData?.key === this.cropKey(x,y));
  }

/* ============================
   Planting with proximity check
   ============================ */
plant(x:number, y:number, state: TileState) {
  // MUST be close enough
  const center = this.grid.tileCenter(x, y);
  const dx = this.player.group.position.x - center.x;
  const dz = this.player.group.position.z - center.z;
  const dist = Math.hypot(dx, dz);
  const maxDist = PLANT_RANGE_TILES * this.grid.tileSize;
  if (dist > maxDist) return false;

  // Tile must be soil and empty
  if (state.type !== 'soil') return false;
  if (state.crop) return false;

  // Create crop with growth accumulator
  state.crop = { kind: 'wheat', plantedAt: Date.now(), stage: 0, growthMs: 0 };

  const mesh = this.createCropMesh(0);
  mesh.position.set(center.x, 0.002, center.z);
  (mesh as any).userData = { key: this.cropKey(x, y) };
  this.getCropsGroup().add(mesh);

  // Tiny fertility nudge on planting (optional)
  state.fertility = Math.min(1, (state.fertility ?? 0) + 0.15);
  return true;
}


  harvest(_x:number,_y:number,_state: TileState) { return false; } // tool removed
  plow(_x:number,_y:number,_state: TileState) { return false; }   // tool removed

updateCropsVisuals(grid: TileState[][]) {
  const group = this.getCropsGroup();

  // Must mirror createCropMesh()’s intent
  const heights = [0.05, 0.15, 0.28, 0.42];

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const t = grid[y][x];
      if (!t.crop) continue;

      const stage = t.crop.stage;
      const expectedHeight = heights[stage];

      // Ensure a mesh exists and matches the current stage's geometry
      let mesh = this.findCropMesh(x, y) as THREE.Mesh | undefined;
      if (mesh) {
        const currentHeight = (mesh as any).geometry?.parameters?.height ?? 0;
        if (Math.abs(currentHeight - expectedHeight) > 0.01) {
          // Stage changed -> rebuild mesh for that stage
          group.remove(mesh);
          mesh = this.createCropMesh(stage);
          const c = this.grid.tileCenter(x, y);
          mesh.position.set(c.x, 0.002, c.z);
          (mesh as any).userData = { key: this.cropKey(x, y) };
          group.add(mesh);
        }
      } else {
        mesh = this.createCropMesh(stage);
        const c = this.grid.tileCenter(x, y);
        mesh.position.set(c.x, 0.002, c.z);
        (mesh as any).userData = { key: this.cropKey(x, y) };
        group.add(mesh);
      }

      // --- Size scaling to fill the tile by late game ---
      // Progress within the current stage [0..1]
      const stageProgress = Math.max(0, Math.min(1, (t.crop.growthMs ?? 0) / BASE_STAGE_MS));

      // Desired diameter as a fraction of tile size (lerp per-stage start->end)
      const coverStart = STAGE_START_COVER[stage];
      const coverEnd   = STAGE_END_COVER[stage];
      const coverFrac  = THREE.MathUtils.lerp(coverStart, coverEnd, stageProgress) * TILE_FILL_SAFETY;

      // Compute the uniform scale needed so the cone's *footprint diameter* matches coverFrac * tileSize
      // ConeGeometry parameters include the base radius we authored in createCropMesh()
      const baseRadius = (mesh.geometry as any).parameters?.radius ?? (0.12 + stage * 0.02);
      const desiredDiameter = this.grid.tileSize * coverFrac;
      const currentDiameter = 2 * baseRadius; // before scaling
      const scale = desiredDiameter / currentDiameter;

      mesh.scale.setScalar(scale);
    }
  }
}



  /* ============================
     Fertility application/visuals
     ============================ */
  private tileKey(x:number,y:number) { return `${x},${y}`; }

  private getOrCreateFertilityOverlay(x:number,y:number): THREE.Mesh {
    const key = this.tileKey(x,y);
    const existing = this._fertilityOverlays.get(key);
    if (existing) return existing;

    const g = new THREE.PlaneGeometry(this.grid.tileSize, this.grid.tileSize);
    const m = new THREE.MeshBasicMaterial({
      color: FERTILITY_TINT_COLOR,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    const c = this.grid.tileCenter(x,y);
    mesh.position.set(c.x, 0, c.z);
    this._fertilityGroup.add(mesh);
    this._fertilityOverlays.set(key, mesh);

    if (DEBUG_FERTILITY_NUMBERS) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.font = '600 10px system-ui';
      el.style.color = '#ffd34d';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.8';
      document.body.appendChild(el);
      this._fertilityTextEls.set(key, el);
    }

    return mesh;
  }

  private applyFertilityAtPosition(pos: THREE.Vector3) {
    const t = this.grid.worldToTile(pos);
    if (!t) return;

    const radius = FERTILITY_RADIUS_TILES * this.grid.tileSize;
    const rTiles = Math.ceil(FERTILITY_RADIUS_TILES) + 1;

    for (let dy = -rTiles; dy <= rTiles; dy++) {
      for (let dx = -rTiles; dx <= rTiles; dx++) {
        const x = t.x + dx, y = t.y + dy;
        if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) continue;

        const center = this.grid.tileCenter(x, y);
        const d = Math.hypot(center.x - pos.x, center.z - pos.z);
        if (d <= radius) {
          const tile = this.grid.tiles[y][x] as TileState;
          tile.fertility = Math.min(1, (tile.fertility ?? 0) + FERTILITY_ADD_PER_TOUCH);
        }
      }
    }
  }

  private updateFertilityVisualsAroundPlayer() {
    const t = this.grid.worldToTile(this.player.group.position);
    if (!t) return;

    const r = NEAR_VIS_RADIUS_TILES;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = t.x + dx, y = t.y + dy;
        if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) continue;

        const tile = this.grid.tiles[y][x] as TileState;
        const f = THREE.MathUtils.clamp(tile.fertility ?? 0, 0, 1);
        const key = this.tileKey(x,y);

        if (f <= 0.001) {
          const mesh = this._fertilityOverlays.get(key);
          if (mesh) (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
          continue;
        }

        const mesh = this.getOrCreateFertilityOverlay(x,y);
        (mesh.material as THREE.MeshBasicMaterial).opacity = FERTILITY_TINT_ALPHA_MAX * f;

        if (DEBUG_FERTILITY_NUMBERS) {
          const el = this._fertilityTextEls.get(key);
          if (el) {
            const v = this.grid.tileCenter(x,y).clone();
            v.project(this.camera);
            const rect = this.renderer.domElement.getBoundingClientRect();
            const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
            const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
            el.style.left = `${sx - 8}px`;
            el.style.top  = `${sy - 8}px`;
            el.textContent = f.toFixed(2);
          }
        }
      }
    }
  }

  /* ============================
     Player movement
     ============================ */
  private _movePlayer(dt:number) {
    const dir = getMoveVector(this);
    if (dir.lengthSq() > 0) dir.multiplyScalar(this.player.speed * dt);

    const halfW = (this.grid.width * this.grid.tileSize) / 2;
    const halfH = (this.grid.height * this.grid.tileSize) / 2;
    const margin = 0.5;

    const nx = THREE.MathUtils.clamp(this.player.group.position.x + dir.x, -halfW + margin, halfW - margin);
    const nz = THREE.MathUtils.clamp(this.player.group.position.z + dir.z, -halfH + margin, halfH - margin);

    // slow, subtle hover + seed spin visibility
    const time = performance.now() * 0.001;
    const ny = 0.25 + Math.sin(time * 1.2) * 0.006;
    this._seedGroup.visible = (this.tool === 'plant');
    this._seedGroup.rotation.y += dt * 1.6; // slow spin

    if (dir.lengthSq() > 0) {
      const pos = this.player.group.position;
      this._trail.spawn(pos.x, pos.y, pos.z);
      this.applyFertilityAtPosition(pos);
    }

    this.player.group.position.set(nx, ny, nz);

    // Camera follow
    const target = new THREE.Vector3().copy(this.player.group.position).add(this._camOffset);
    this.camera.position.lerp(target, 0.18);
    this.camera.lookAt(this.player.group.position);
  }

  /* ============================
     Growth multiplier hook
     ============================ */
  private growthMultiplierFor(tile: TileState): number {
    const f = THREE.MathUtils.clamp(tile.fertility ?? 0, 0, 1);
    return THREE.MathUtils.lerp(GROWTH_MULT_MIN, GROWTH_MULT_MAX, f);
  }

tick(grid: TileState[][]) {
  const dt = this._clock.getDelta();

  // Fertility decay (global; grid is small)
  const decay = FERTILITY_DECAY_PER_SEC * dt;
  for (let y = 0; y < this.grid.height; y++) {
    for (let x = 0; x < this.grid.width; x++) {
      const t = grid[y][x] as TileState;
      if ((t.fertility ?? 0) > 0) t.fertility = Math.max(0, (t.fertility ?? 0) - decay);
    }
  }

  // Growth progression WITH fertility multiplier (delta-based)
  if (APPLY_GROWTH_TICK) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const tile = grid[y][x] as TileState;
        const c = tile.crop;
        if (!c) continue;

        // current fertility affects current rate; add global rate knob
        const mult = this.growthMultiplierFor(tile);            // 1.00..1.75
        c.growthMs = (c.growthMs ?? 0) + dt * mult * 1000 * GROWTH_RATE_MULT;

        // Promote stages when enough effective time has accumulated
        while (c.stage < 3 && (c.growthMs ?? 0) >= BASE_STAGE_MS) {
          c.growthMs! -= BASE_STAGE_MS;
          c.stage = (c.stage + 1) as 0 | 1 | 2 | 3;
        }
      }
    }
  }

  // ✅ make crop meshes match updated stages AND progress
  this.updateCropsVisuals(grid);

  // Fertility tint near the player
  this.updateFertilityVisualsAroundPlayer();

  // Player + trail
  this._movePlayer(dt);
  this.player.updateGlow(performance.now() / 1000);
  this._trail.update(dt);

  this.renderer.render(this.scene, this.camera);
}



}
