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
const FERTILITY_TINT_ALPHA_MAX = 0.15;
const NEAR_VIS_RADIUS_TILES = 2;
const DEBUG_FERTILITY_NUMBERS = false;
/* === Constellation Meter (UI) === */
const CONSTELLATION_METER_MAX   = 100;

/* === Garden Bloom (Nova rebrand) === */
const BLOOM_SCALE_THRESHOLD     = 1.35;   // star scale to trigger a bloom
const BLOOM_RADIUS_TILES        = 3.5;
const BLOOM_COOLDOWN_SEC        = 6.0;
const BLOOM_TILE_FLASH_ALPHA    = 0.20;
const BLOOM_TILE_FLASH_SEC      = 0.25;

/* === Stage-3 Shimmer (FX hook – non-destructive) === */
const SHIMMER_PARTICLE_COUNT    = 12;
const SHIMMER_DURATION_SEC      = 0.9;
const SHIMMER_PERIOD_SEC        = 1.2;    // how often stage-3 plants emit
const SHIMMER_STAR_GAIN         = 0.005;  // star scale gained per shimmer
const SHIMMER_TO_METER          = 0.5;    // split to Constellation meter (0..1)

/* === Palette (already added earlier) reused for shimmer colors === */
// PALETTE_LAVENDER / TEAL / ROSE and GARDEN_PALETTE should already exist

/* === Enable growth so fertility affects crops === */
const APPLY_GROWTH_TICK = true;

// Shared crop heights by stage (single source of truth)
const STAGE_HEIGHTS = [0.06, 0.16, 0.30, 0.46];

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
const STAGE_START_COVER = [0.25, 0.55, 0.80, 0.92]; // at stage start (diameter / tileSize)
const STAGE_END_COVER   = [0.25, 0.55, 0.80, 0.92]; // at stage end   (diameter / tileSize)
const TILE_FILL_SAFETY  = 0.98; // keep a hair inside the tile to avoid Z-fighting/overlap

/* === Stardust Harvest Absorption (tweakable) === */
const ABSORB_PARTICLE_COUNT = 28;
const ABSORB_BURST_RADIUS   = 0.15;   // initial outward jiggle
const ABSORB_DURATION_SEC   = 1.0;
const ABSORB_COLOR          = 0xffffff;

const STAR_MASS_GAIN        = 0.02;   // per absorbed crop (scale increment)
const STAR_SCALE_MIN        = 1.00;
const STAR_SCALE_MAX        = 1.50;

/* === Star Nova (tweakable) === */
const STAR_NOVA_SCALE        = 1.35;  // scale threshold to trigger nova
const NOVA_RADIUS_TILES      = 3.5;   // effect radius in tiles
const NOVA_METER_MAX         = 100;   // percent
const NOVA_YIELD_PER_CROP    = 1;     // units per popped crop
const NOVA_SPLIT_TO_METER    = 0.5;   // 50% to meter
const NOVA_COOLDOWN_SEC      = 6.0;   // short cooldown; set 0 to disable
const NOVA_TILE_FLASH_ALPHA  = 0.20;  // subtle flash opacity boost
const NOVA_TILE_FLASH_SEC    = 0.25;  // flash fade time (seconds)

/* === Stardust Garden Palette (editable) === */
const PALETTE_LAVENDER = 0xBFA2DB;
const PALETTE_TEAL     = 0xA2D9CE;
const PALETTE_ROSE     = 0xF5B7B1;

const GARDEN_PALETTE = [PALETTE_LAVENDER, PALETTE_TEAL, PALETTE_ROSE];

/* Use a single soft pastel for the “Garden Bloom” pulse & fertility tint */
const BLOOM_PULSE_COLOR = PALETTE_LAVENDER;

/* Optional: unify your fertility overlay tint with the palette */
const FERTILITY_TINT_COLOR = PALETTE_TEAL;

/* Make absorption glitter match the palette too (we’ll pick per spawn) */
const ABSORB_COLOR_DEFAULT = PALETTE_ROSE;

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

private _novaCooldownLeft = 0;
private _novaMeter = 0; // 0..NOVA_METER_MAX

// Fades the soft tile flash created by a Garden Bloom pulse.
private updateBloomFlashes(_dt: number) {
  if (this._bloomFlashes.size === 0) return;
  const now = performance.now() * 0.001;

  for (const [key, until] of this._bloomFlashes) {
    const remaining = until - now;
    if (remaining <= 0) { 
      this._bloomFlashes.delete(key); 
      continue; 
    }

    const [sx, sy] = key.split(',').map(n => parseInt(n, 10));
    if (Number.isNaN(sx) || Number.isNaN(sy)) continue;

    const mesh = this.getOrCreateFertilityOverlay(sx, sy);
    const mat = mesh.material as THREE.MeshBasicMaterial;

    // Use garden bloom tint; additive flash over fertility tint.
    mat.color.setHex(BLOOM_PULSE_COLOR);

    const flashFactor = THREE.MathUtils.clamp(remaining / BLOOM_TILE_FLASH_SEC, 0, 1);
    const addAlpha = BLOOM_TILE_FLASH_ALPHA * flashFactor;
    mat.opacity = Math.max(mat.opacity, addAlpha);
  }
}

// tile-key -> flash end-time (seconds)
private _novaFlashes = new Map<string, number>();

// simple UI refs for the right-side meter
private _novaMeterRoot?: HTMLDivElement;
private _novaMeterFill?: HTMLDivElement;

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
  const radius = 0.12 + stage * 0.02;
  const g = new THREE.ConeGeometry(radius, STAGE_HEIGHTS[stage], 8, 1, false);
  const colorHex = GARDEN_PALETTE[stage % GARDEN_PALETTE.length];
  const m = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.28 + stage * 0.12,
    roughness: 0.85,
    metalness: 0.0
  });
  const mesh = new THREE.Mesh(g, m);
  (mesh as any).userData.stage = stage;         // ← store stage (helps comparison)
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
// Stage-3 shimmer emitters: tileKey -> next emit time (seconds)
private _bloomEmitters = new Map<string, number>();

// Active shimmer particle batches
private _shimmers: Array<{
  points: THREE.Points;
  positions: Float32Array;
  from: THREE.Vector3;
  startTime: number;        // seconds
  duration: number;         // seconds
}> = [];

// Constellation meter (rebrand)
private _constellationMeter = 0; // 0..CONSTELLATION_METER_MAX

// Bloom flashes (tileKey -> until time in seconds)
private _bloomFlashes = new Map<string, number>();

// Bloom cooldown
private _bloomCooldownLeft = 0;

  private _absorptions: Array<{
  points: THREE.Points;
  positions: Float32Array;
  startOffset: Float32Array;
  from: THREE.Vector3;
  startTime: number;    // seconds
  duration: number;     // seconds
}> = [];

private _starScale = STAR_SCALE_MIN;
private _starScaleTarget = STAR_SCALE_MIN;

/* ============================
   Planting with proximity check
   ============================ */
plant(x:number, y:number, state: TileState) {
  const center = this.grid.tileCenter(x, y);
  const dx = this.player.group.position.x - center.x;
  const dz = this.player.group.position.z - center.z;
  const dist = Math.hypot(dx, dz);
  const maxDist = PLANT_RANGE_TILES * this.grid.tileSize;
  if (dist > maxDist) return false;

  if (state.type !== 'soil') return false;
  if (state.crop) return false;

  state.crop = { kind: 'wheat', plantedAt: Date.now(), stage: 0, growthMs: 0 };

  const mesh = this.createCropMesh(0);
  mesh.position.set(center.x, 0.002, center.z);
  (mesh as any).userData = { key: this.cropKey(x, y), stage: 0 }; // set once
  this.getCropsGroup().add(mesh);                                  // add once

  state.fertility = Math.min(1, (state.fertility ?? 0) + 0.15);
  return true;
}



  harvest(_x:number,_y:number,_state: TileState) { return false; } // tool removed
  plow(_x:number,_y:number,_state: TileState) { return false; }   // tool removed

updateCropsVisuals(grid: TileState[][]) {
  const group = this.getCropsGroup();
  const activeKeys = new Set<string>();

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const t = grid[y][x];
      if (!t.crop) continue;

      const stage = t.crop.stage;
      const expectedHeight = STAGE_HEIGHTS[stage];   // ← use shared array
      const key = this.cropKey(x, y);
      activeKeys.add(key);

      let mesh = this.findCropMesh(x, y) as THREE.Mesh | undefined;
      if (mesh) {
        // Prefer comparing by stage to avoid float param fragility:
        const meshStage = (mesh as any).userData?.stage;
        if (meshStage !== stage) {
          group.remove(mesh);
          mesh = this.createCropMesh(stage);
          const c = this.grid.tileCenter(x, y);
          mesh.position.set(c.x, 0.002, c.z);
          (mesh as any).userData = { key, stage };
          group.add(mesh);
        }
      } else {
        mesh = this.createCropMesh(stage);
        const c = this.grid.tileCenter(x, y);
        mesh.position.set(c.x, 0.002, c.z);
        (mesh as any).userData = { key, stage };
        group.add(mesh);
      }

      // ... (rest of your scaling/label code unchanged)


      // --- SIZE SCALING: make each new stage significantly bigger, then grow within the stage ---
      // Progress within current stage [0..1]
      const stageProgress = Math.max(0, Math.min(1, (t.crop.growthMs ?? 0) / BASE_STAGE_MS));

      // Desired diameter as a fraction of tile size (big jump at stage start, then lerp within stage)
      const coverStart = STAGE_START_COVER[stage];  // e.g., 0.20 -> 0.40 -> 0.65 -> 0.85
      const coverEnd   = STAGE_END_COVER[stage];    // e.g., 0.40 -> 0.70 -> 0.90 -> 0.98
      const coverFrac  = THREE.MathUtils.lerp(coverStart, coverEnd, stageProgress) * TILE_FILL_SAFETY;

      // Compute uniform scale so the cone footprint matches coverFrac * tileSize
      const baseRadius = (mesh.geometry as any).parameters?.radius ?? (0.12 + stage * 0.02);
      const desiredDiameter = this.grid.tileSize * coverFrac;
      const currentDiameter = 2 * baseRadius; // pre-scale diameter from geometry params
      const scale = desiredDiameter / currentDiameter;
      mesh.scale.setScalar(scale);

      // --- Stage label sprite (billboarded number above the plant) ---
      const label = this.getOrCreateStageLabel(x, y, stage);
      const c = this.grid.tileCenter(x, y);

      // Compute world Y for the label: base + scaled mesh height + small offset
      const baseY = 0.002;
      const meshHeight = ((mesh as any).geometry?.parameters?.height ?? expectedHeight) * mesh.scale.y;
      const labelY = baseY + meshHeight + 0.12;

      label.position.set(c.x, labelY, c.z);
    }
  }

  // Cleanup labels whose crops were removed this frame
  for (const [key, entry] of this._stageLabels) {
    if (!activeKeys.has(key)) {
      entry.sprite.parent?.remove(entry.sprite);
      (entry.sprite.material as THREE.SpriteMaterial).map?.dispose();
      (entry.sprite.material as THREE.SpriteMaterial).dispose();
      this._stageLabels.delete(key);
    }
  }
}


private getOrCreateFertilityOverlay(x: number, y: number): THREE.Mesh {
  const key = this.tileKey(x, y);
  const existing = this._fertilityOverlays.get(key);
  if (existing) return existing;

  const g = new THREE.PlaneGeometry(this.grid.tileSize, this.grid.tileSize);
  const m = new THREE.MeshBasicMaterial({
    color: FERTILITY_TINT_COLOR,   // ← pulled from palette constants
    transparent: true,
    opacity: 0,                    // updated elsewhere per-frame
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  const c = this.grid.tileCenter(x, y);
  mesh.position.set(c.x, 0, c.z);

  this._fertilityGroup.add(mesh);
  this._fertilityOverlays.set(key, mesh);
  return mesh;
}





  /* ============================
     Fertility application/visuals
     ============================ */
  private tileKey(x:number,y:number) { return `${x},${y}`; }
private makeStageNumberTexture(stage: number): THREE.CanvasTexture {
  const size = 128; // higher = crisper
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Clear
  ctx.clearRect(0, 0, size, size);

  // Soft glow circle
  const r = size * 0.48;
  const cx = size * 0.5, cy = size * 0.5;
  const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  grad.addColorStop(0, 'rgba(255, 211, 77, 0.75)');
  grad.addColorStop(1, 'rgba(255, 211, 77, 0.00)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Number with outline
  const label = String(stage);
  ctx.font = `bold ${Math.floor(size * 0.56)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outline
  ctx.lineWidth = Math.max(2, Math.floor(size * 0.06));
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(label, cx, cy);

  // Fill
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, cx, cy);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy?.() ?? 1;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

private getOrCreateStageLabel(x: number, y: number, stage: number): THREE.Sprite {
  const key = this.cropKey(x, y);
  const existing = this._stageLabels.get(key);

  // If exists and same stage, just return it
  if (existing && existing.stage === stage) {
    return existing.sprite;
  }

  // If exists but stage changed, redraw the texture
  if (existing && existing.stage !== stage) {
    const mat = existing.sprite.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = this.makeStageNumberTexture(stage);
    mat.needsUpdate = true;
    existing.stage = stage;
    return existing.sprite;
  }

  // Create a new sprite
  const tex = this.makeStageNumberTexture(stage);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(mat);

  // Size relative to tile; tune if needed
  const size = 0.35 * this.grid.tileSize; // width and height in world units
  sprite.scale.set(size, size, 1);

  this.scene.add(sprite); // add to scene root so it always billboards to camera
  this._stageLabels.set(key, { sprite, stage });

  return sprite;
}

private _stageLabels = new Map<string, { sprite: THREE.Sprite, stage: number }>();

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
private spawnAbsorbEffect(x: number, y: number, addStarGain: boolean = true) {
  // Remove crop mesh & stage label immediately
  const key = this.cropKey(x, y);
  const mesh = this.findCropMesh(x, y) as THREE.Mesh | undefined;
  if (mesh) {
    mesh.parent?.remove(mesh);
    (mesh.material as THREE.Material).dispose?.();
    (mesh.geometry as THREE.BufferGeometry).dispose?.();
  }
  const label = this._stageLabels.get(key);
  if (label) {
    label.sprite.parent?.remove(label.sprite);
    (label.sprite.material as THREE.SpriteMaterial).map?.dispose();
    (label.sprite.material as THREE.SpriteMaterial).dispose();
    this._stageLabels.delete(key);
  }

  const from = this.grid.tileCenter(x, y).clone();
  from.y = 0.15;

  const N = ABSORB_PARTICLE_COUNT;
  const positions = new Float32Array(N * 3);
  const startOffset = new Float32Array(N * 3);

  for (let i = 0; i < N; i++) {
    let ox = 0, oy = 0, oz = 0, d2 = 2;
    while (d2 > 1) {
      ox = Math.random() * 2 - 1;
      oy = Math.random() * 2 - 1;
      oz = Math.random() * 2 - 1;
      d2 = ox*ox + oy*oy + oz*oz;
    }
    const r = ABSORB_BURST_RADIUS * Math.cbrt(d2);
    const sx = ox * r, sy = oy * r, sz = oz * r;

    startOffset[i*3+0] = sx;
    startOffset[i*3+1] = sy;
    startOffset[i*3+2] = sz;

    positions[i*3+0] = from.x + sx;
    positions[i*3+1] = from.y + sy;
    positions[i*3+2] = from.z + sz;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // 🎨 Pick a gentle color from the palette per absorption event
  const absorbColor = GARDEN_PALETTE[Math.floor(Math.random() * GARDEN_PALETTE.length)] ?? ABSORB_COLOR_DEFAULT;

  const mat = new THREE.PointsMaterial({
    color: absorbColor,
    size: 0.06,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geom, mat);
  this.scene.add(points);

  this._absorptions.push({
    points,
    positions,
    startOffset,
    from,
    startTime: performance.now() * 0.001,
    duration: ABSORB_DURATION_SEC
  });

  if (addStarGain) {
    this._starScaleTarget = THREE.MathUtils.clamp(
      this._starScaleTarget + STAR_MASS_GAIN,
      STAR_SCALE_MIN,
      STAR_SCALE_MAX
    );
  }
}

private tryTriggerNova(dt: number, grid: TileState[][]) {
  // cooldown
  if (this._novaCooldownLeft > 0) {
    this._novaCooldownLeft = Math.max(0, this._novaCooldownLeft - dt);
  }

  // Trigger when actual scale reaches threshold (not just the target)
  if (this._novaCooldownLeft === 0 && this._starScale >= STAR_NOVA_SCALE) {
    this.runNova(grid);
    if (NOVA_COOLDOWN_SEC > 0) this._novaCooldownLeft = NOVA_COOLDOWN_SEC;
  }
}
private runNova(grid: TileState[][]) {
  // Center & radius in world units
  const origin = this.player.group.position.clone();
  const radiusW = NOVA_RADIUS_TILES * this.grid.tileSize;

  // Tile index near the star
  const t = this.grid.worldToTile(origin);
  if (!t) return;

  const rTiles = Math.ceil(NOVA_RADIUS_TILES);
  let popped = 0;

  for (let dy = -rTiles; dy <= rTiles; dy++) {
    for (let dx = -rTiles; dx <= rTiles; dx++) {
      const x = t.x + dx, y = t.y + dy;
      if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) continue;

      const center = this.grid.tileCenter(x, y);
      const d = Math.hypot(center.x - origin.x, center.z - origin.z);
      if (d > radiusW) continue;

      const tile = grid[y][x] as TileState;
      if (!tile.crop) continue;

      // If not already at stage 3, force stage 3 and pop
      if (tile.crop.stage < 3) {
        // mark a quick flash for this tile
        const key = `${x},${y}`;
        this._novaFlashes.set(key, (performance.now() * 0.001) + NOVA_TILE_FLASH_SEC);

        // pop with glitter but NO star gain here (we split below)
        this.spawnAbsorbEffect(x, y, /*addStarGain=*/false);
        tile.crop = undefined;
        popped++;
      }
    }
  }

  if (popped <= 0) return;

  // Split yield
  const totalUnits = popped * NOVA_YIELD_PER_CROP;
  const meterUnits = totalUnits * NOVA_SPLIT_TO_METER;
  const starUnits  = totalUnits - meterUnits;

  // Meter (treat units as percentage points, clamped)
  this._novaMeter = Math.min(NOVA_METER_MAX, this._novaMeter + meterUnits);

  // Star gain from the star share
  const starGain = STAR_MASS_GAIN * starUnits;
  this._starScaleTarget = THREE.MathUtils.clamp(
    this._starScaleTarget + starGain,
    STAR_SCALE_MIN,
    STAR_SCALE_MAX
  );
}
private updateNovaFlashes(_dt: number) {
  if (this._novaFlashes.size === 0) return;
  const now = performance.now() * 0.001;

  for (const [key, until] of this._novaFlashes) {
    const remaining = until - now;
    if (remaining <= 0) {
      this._novaFlashes.delete(key);
      continue;
    }

    const [sx, sy] = key.split(',').map(n => parseInt(n, 10));
    if (Number.isNaN(sx) || Number.isNaN(sy)) continue;

    const mesh = this.getOrCreateFertilityOverlay(sx, sy);
    const mat = mesh.material as THREE.MeshBasicMaterial;

    // Tint flash with the garden bloom color
    mat.color.setHex(BLOOM_PULSE_COLOR);

    // Base opacity is set by fertility visuals; apply a quick additive flash
    const flashFactor = THREE.MathUtils.clamp(remaining / NOVA_TILE_FLASH_SEC, 0, 1);
    const addAlpha = NOVA_TILE_FLASH_ALPHA * flashFactor;
    mat.opacity = Math.max(mat.opacity, addAlpha);
  }
}

private updateConstellationMeterUI() {
  if (!this._novaMeterRoot) {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      right: '16px',
      top: '16px',
      width: '20px',
      height: '160px',
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.06)',
      overflow: 'hidden',
      zIndex: '9999',
      pointerEvents: 'none'
    });
    const fill = document.createElement('div');
    Object.assign(fill.style, {
      position: 'absolute',
      bottom: '0',
      left: '0',
      width: '100%',
      height: '0%',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.35))'
    });
    root.appendChild(fill);
    document.body.appendChild(root);
    this._novaMeterRoot = root;     // reuse existing refs
    this._novaMeterFill = fill;
  }
  const pct = THREE.MathUtils.clamp(this._constellationMeter / CONSTELLATION_METER_MAX, 0, 1) * 100;
  if (this._novaMeterFill) this._novaMeterFill.style.height = `${pct}%`;
}


private updateAbsorptions(_dt: number) {
  if (this._absorptions.length === 0) return;

  const now = performance.now() * 0.001;
  const starPos = this.player.group.position.clone();
  starPos.y += 0.45; // aim slightly above the star center

  // easing helper (smooth, fast finish)
  const ease = (t: number) => 1 - (1 - t) * (1 - t);

  for (let i = this._absorptions.length - 1; i >= 0; i--) {
    const fx = this._absorptions[i];
    const { points, positions, startOffset, from, startTime, duration } = fx;

    const rawT = THREE.MathUtils.clamp((now - startTime) / Math.max(0.001, duration), 0, 1);
    const t = ease(rawT);

    // Update particle positions toward the (moving) star
    for (let p = 0; p < positions.length; p += 3) {
      const sx = startOffset[p];
      const sy = startOffset[p + 1];
      const sz = startOffset[p + 2];

      // start = from + startOffset
      // end   = starPos
      const startX = from.x + sx;
      const startY = from.y + sy;
      const startZ = from.z + sz;

      positions[p]     = THREE.MathUtils.lerp(startX, starPos.x, t);
      positions[p + 1] = THREE.MathUtils.lerp(startY, starPos.y, t);
      positions[p + 2] = THREE.MathUtils.lerp(startZ, starPos.z, t);
    }

    // fade out as they approach
    (points.material as THREE.PointsMaterial).opacity = 1.0 - t;
    (points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    // done?
    if (rawT >= 1) {
      points.parent?.remove(points);
      (points.material as THREE.PointsMaterial).dispose();
      (points.geometry as THREE.BufferGeometry).dispose();
      this._absorptions.splice(i, 1);
    }
  }
}
private _updateStarScale(dt: number) {
  // critically-damped-ish easing toward target
  const k = 8.0; // responsiveness; larger = snappier
  this._starScale += (this._starScaleTarget - this._starScale) * (1 - Math.exp(-k * dt));
  this.player.group.scale.setScalar(this._starScale);
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

  // Fertility decay
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
        const c = tile.crop; if (!c) continue;

        const before = c.stage;
        const mult = this.growthMultiplierFor(tile);
        c.growthMs = (c.growthMs ?? 0) + dt * mult * 1000 * GROWTH_RATE_MULT;

        while (c.stage < 3 && (c.growthMs ?? 0) >= BASE_STAGE_MS) {
          c.growthMs! -= BASE_STAGE_MS;
          c.stage = (c.stage + 1) as 0 | 1 | 2 | 3;
        }

        // 🌸 NEW: on first frame reaching stage 3, DO NOT remove the crop.
        // Register a shimmer emitter for this tile (periodic gentle sparkle).
        if (before !== 3 && c.stage === 3) {
          const key = this.cropKey(x, y);
          this._bloomEmitters.set(key, performance.now() * 0.001); // emit immediately
        }
      }
    }
  }

  // Emit shimmers from any stage-3 plants on their cadence
  this.updateBloomEmitters(grid);

  // Try a Garden Bloom (scale threshold + cooldown)
  this.tryTriggerBloom(dt, grid);

  // Visuals that depend on crop states (labels/mesh scaling)
  this.updateCropsVisuals(grid);

  // Fertility tint & Bloom flashes
  this.updateFertilityVisualsAroundPlayer();
  this.updateBloomFlashes(dt);

  // Update particle FX
  this.updateShimmers(dt);
  this.updateAbsorptions(dt); // (absorption is still used elsewhere if you kept it)

  // Player + trail
  this._movePlayer(dt);
  this.player.updateGlow(performance.now() / 1000);

  // Star easing & UI
  this._updateStarScale(dt);
  this.updateConstellationMeterUI();

  // Stardust trail sim
  this._trail.update(dt);

  // Draw
  this.renderer.render(this.scene, this.camera);
  
}
// Emit gentle shimmer from stage-3 plants, split yield to star + constellation meter.
private updateBloomEmitters(grid: TileState[][]) {
  const now = performance.now() * 0.001;
  for (const [key, nextAt] of this._bloomEmitters) {
    if (now < nextAt) continue;

    // Support both "crop-x-y" and "x,y"
    let x: number, y: number;
    if (key.startsWith('crop-')) {
      const parts = key.split('-'); // ["crop","x","y"]
      x = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
    } else {
      const parts = key.split(','); // ["x","y"]
      x = parseInt(parts[0], 10);
      y = parseInt(parts[1], 10);
    }
    if (Number.isNaN(x) || Number.isNaN(y)) { this._bloomEmitters.delete(key); continue; }

    const tile = (grid[y]?.[x] as TileState | undefined);
    if (!tile?.crop || tile.crop.stage !== 3) { this._bloomEmitters.delete(key); continue; }

    // Spawn shimmer FX (cheap Points) from this tile to the star
    this.spawnShimmerFromTile(x, y);

    // Split “yield” of 1 unit per shimmer
    this._constellationMeter = Math.min(CONSTELLATION_METER_MAX,
      this._constellationMeter + (1 * SHIMMER_TO_METER));
    this._starScaleTarget = THREE.MathUtils.clamp(
      this._starScaleTarget + SHIMMER_STAR_GAIN * (1 - SHIMMER_TO_METER),
      STAR_SCALE_MIN, STAR_SCALE_MAX
    );

    // Schedule next emission
    this._bloomEmitters.set(key, now + SHIMMER_PERIOD_SEC);
  }
}

private tryTriggerBloom(dt: number, grid: TileState[][]) {
  if (this._bloomCooldownLeft > 0) {
    this._bloomCooldownLeft = Math.max(0, this._bloomCooldownLeft - dt);
  }
  if (this._bloomCooldownLeft === 0 && this._starScale >= BLOOM_SCALE_THRESHOLD) {
    this.runBloom(grid);
    if (BLOOM_COOLDOWN_SEC > 0) this._bloomCooldownLeft = BLOOM_COOLDOWN_SEC;
  }
}

private runBloom(grid: TileState[][]) {
  const origin = this.player.group.position.clone();
  const radiusW = BLOOM_RADIUS_TILES * this.grid.tileSize;
  const t = this.grid.worldToTile(origin); if (!t) return;

  const rTiles = Math.ceil(BLOOM_RADIUS_TILES);

  for (let dy = -rTiles; dy <= rTiles; dy++) {
    for (let dx = -rTiles; dx <= rTiles; dx++) {
      const x = t.x + dx, y = t.y + dy;
      if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) continue;

      const center = this.grid.tileCenter(x, y);
      if (Math.hypot(center.x - origin.x, center.z - origin.z) > radiusW) continue;

      const tile = grid[y][x] as TileState;
      const c = tile.crop;
      if (!c) continue;

      // Harmony: instantly bloom to stage 3 (no removal), then shimmer passes will take over
      if (c.stage < 3) {
        c.stage = 3 as 0|1|2|3;
        c.growthMs = 0; // optional: start progress fresh
        const key = this.cropKey(x, y);
        this._bloomEmitters.set(key, performance.now() * 0.001); // emit immediately
      }

      // Soft tile flash to visualize the pulse
      const flashKey = `${x},${y}`;
      this._bloomFlashes.set(flashKey, (performance.now() * 0.001) + BLOOM_TILE_FLASH_SEC);
    }
  }
}

private spawnShimmerFromTile(x: number, y: number) {
  const from = this.grid.tileCenter(x, y).clone(); from.y = 0.18;

  const N = SHIMMER_PARTICLE_COUNT;
  const positions = new Float32Array(N * 3);

  // tiny outward jitter
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = (Math.random() * 0.06) + 0.02;
    positions[i*3+0] = from.x + Math.cos(a) * r;
    positions[i*3+1] = from.y + (Math.random() * 0.04);
    positions[i*3+2] = from.z + Math.sin(a) * r;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const colorHex = GARDEN_PALETTE[Math.floor(Math.random()*GARDEN_PALETTE.length)];
  const mat = new THREE.PointsMaterial({
    color: colorHex,
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geom, mat);
  this.scene.add(points);

  this._shimmers.push({
    points,
    positions,
    from,
    startTime: performance.now() * 0.001,
    duration: SHIMMER_DURATION_SEC
  });
}

private updateShimmers(_dt: number) {
  if (this._shimmers.length === 0) return;

  const now = performance.now() * 0.001;
  const starPos = this.player.group.position.clone(); starPos.y += 0.45;
  const ease = (t: number) => 1 - (1 - t) * (1 - t);

  for (let i = this._shimmers.length - 1; i >= 0; i--) {
    const fx = this._shimmers[i];
    const t = THREE.MathUtils.clamp((now - fx.startTime) / Math.max(0.001, fx.duration), 0, 1);
    const s = ease(t);

    // lerp each particle from 'from' to star
    const pos = fx.positions;
    for (let p = 0; p < pos.length; p += 3) {
      const sx = pos[p], sy = pos[p+1], sz = pos[p+2];
      pos[p]   = THREE.MathUtils.lerp(sx, starPos.x, s);
      pos[p+1] = THREE.MathUtils.lerp(sy, starPos.y, s);
      pos[p+2] = THREE.MathUtils.lerp(sz, starPos.z, s);
    }

    (fx.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (fx.points.material as THREE.PointsMaterial).opacity = 1.0 - s;

    if (t >= 1) {
      fx.points.parent?.remove(fx.points);
      (fx.points.material as THREE.PointsMaterial).dispose();
      (fx.points.geometry as THREE.BufferGeometry).dispose();
      this._shimmers.splice(i, 1);
    }
  }
}






}
