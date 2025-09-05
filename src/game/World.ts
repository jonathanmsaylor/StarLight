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
// === Crop tile colors by phase ===
const STAGE0_BABY_BLUE = 0xA7D8FF; // phase 1
const STAGE1_SOFT_ORANGE = 0xF6C28B; // phase 2
const STAGE2_RIPPLE_GREEN = 0xA8E6A1; // final

// === Deep Ocean palette ===
const OCEAN_BG      = 0x070C16;  // scene backdrop (very dark navy)
const OCEAN_GROUND  = 0x0A1220;  // base ground deck
const OCEAN_GRID    = 0x132433;  // grid line color
const CAUSTICS_COLOR= 0xBFD9FF;  // for the upcoming caustics wash
// === Dream Pool palette ===
const DREAM_COL_A    = 0x1C2E58;  // deep indigo
const DREAM_COL_B    = 0x103A55;  // blue-teal
const DREAM_CAUSTICS = 0xBFD9FF;  // pale aqua glow
const DREAM_LAVENDER = 0xC7B7FF;  // soft lavender accent

// Caustics tuning for the ground shader (not the overlay)
const DREAM_INTENSITY = 0.12;     // 0..0.6 is nice
const DREAM_SCALE     = 2.95;     // smaller -> larger waves (world units)

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

// === Caustics Wash (soft additive light ripples) ===
const CAUSTICS_INTENSITY   = 0.06;   // overall strength (try 0.03–0.10)
const CAUSTICS_SPEED_1     = 0.30;   // radians/sec
const CAUSTICS_SPEED_2     = -0.22;  // radians/sec
const CAUSTICS_SCALE_1     = 1.7;    // tiling freq 1
const CAUSTICS_SCALE_2     = 1.2;    // tiling freq 2
const CAUSTICS_COLOR_HEX   = 0xBFD9FF; // soft moonlight blue (white also fine)

/* ====== Planting rules ====== */
const PLANT_RANGE_TILES = 1.25; // must be within this distance from tile center
// --- Fertility tide (gentle global alpha wave) ---
const FERTILITY_TIDE_PERIOD_SEC = 12;   // one full swell every ~12s
const FERTILITY_TIDE_STRENGTH   = 0.35; // 0..0.9 (how deep the dip goes)
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

private _caustics?: THREE.Mesh;

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
const mat  = mesh.material as THREE.MeshBasicMaterial;

mat.color.setHex(BLOOM_PULSE_COLOR);
const flashFactor = THREE.MathUtils.clamp(remaining / BLOOM_TILE_FLASH_SEC, 0, 1);
mat.opacity = Math.max(mat.opacity, BLOOM_TILE_FLASH_ALPHA * flashFactor);

  }
}
private _tickCropShaders(tNow: number) {
  const group = this.getCropsGroup();
  for (const obj of group.children) {
    const mesh = obj as THREE.Mesh;
    const matAny = mesh.material as THREE.Material | THREE.Material[];

    if (Array.isArray(matAny)) {
      for (const m of matAny) {
        const sm = m as unknown as THREE.ShaderMaterial;
        if ((sm as any)?.isShaderMaterial && sm.uniforms?.uTime) {
          sm.uniforms.uTime.value = tNow;
        }
      }
    } else {
      const sm = matAny as unknown as THREE.ShaderMaterial;
      if ((sm as any)?.isShaderMaterial && sm.uniforms?.uTime) {
        sm.uniforms.uTime.value = tNow;
      }
    }
  }
}
// Creates a thin plane over the ground that draws faint, slow caustic ripples.
private _createCausticsWash() {
  // Full board size in world units
  const w = this.grid.width  * this.grid.tileSize;
  const h = this.grid.height * this.grid.tileSize;

  const geo = new THREE.PlaneGeometry(w, h, 1, 1);
  geo.rotateX(-Math.PI / 2); // flat on ground

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:      { value: 0 },
      uIntensity: { value: CAUSTICS_INTENSITY },
      uColor:     { value: new THREE.Color(CAUSTICS_COLOR_HEX) },
      uS1:        { value: CAUSTICS_SCALE_1 },
      uS2:        { value: CAUSTICS_SCALE_2 },
      uV1:        { value: CAUSTICS_SPEED_1 },
      uV2:        { value: CAUSTICS_SPEED_2 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3  uColor;
      uniform float uS1, uS2;   // spatial scales
      uniform float uV1, uV2;   // temporal speeds

      // two simple interfering wavefields → faint "water light" look
      void main() {
        // tile UVs a bit so pattern has small ripples over the whole board
        vec2 p1 = vUv * (6.2831853 * uS1);
        vec2 p2 = vUv * (6.2831853 * uS2);

        float t = uTime;

        float w1 = sin(p1.x + t*uV1) * cos(p1.y - t*uV1);
        float w2 = sin((p2.x+p2.y) - t*uV2) * cos((p2.x-p2.y) + t*uV2);

        // centered, subtle signal 0..1
        float ripple = 0.5 + 0.5 * (w1 + w2) * 0.5;

        // super gentle edge falloff so the rectangle feels soft
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x)
                   * smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.0, 0.08, 1.0 - vUv.y);

        float a = uIntensity * ripple * edge;

        gl_FragColor = vec4(uColor, a);
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.001, 0); // sit just above ground (below crops/overlays)
  mesh.frustumCulled = false;
  // Make sure it renders before fertility overlays (those sit ~0.004 high)
  mesh.renderOrder = 0;

  this._caustics = mesh;
  this.scene.add(mesh);
}
// Update the caustics time uniform (called each frame)
private _tickCausticsWash(tNow: number) {
  if (!this._caustics) return;
  const sm = this._caustics.material as THREE.ShaderMaterial;
  if ((sm as any)?.isShaderMaterial && sm.uniforms?.uTime) {
    sm.uniforms.uTime.value = tNow;
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
    this.scene.background = new THREE.Color(OCEAN_BG);
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
    // Apply Deep Ocean palette to ground + grid
{
this._installDreamPoolGround();   // apply the dreamy ground shader
this._createCausticsWash();       // (optional) additive ripples overlay you added


// Caustics tuning
const DREAM_INTENSITY = 0.22;   // 0..0.6 is nice
const DREAM_SCALE     = 0.45;   // smaller -> larger waves (world units)

  // Ground plane (the thing you raycast against)
  const planeMat = this.grid.plane.material as any;
  if (planeMat?.color) planeMat.color.setHex(OCEAN_GROUND);
  if ('transparent' in planeMat) { planeMat.transparent = false; planeMat.opacity = 1; }

  // Grid lines inside the grid group (Line/LineSegments)
  this.grid.group.traverse(obj => {
    const m: any = (obj as any).material;
    if (!m) return;
    if (m.isLineBasicMaterial || obj.type === 'Line' || obj.type === 'LineSegments') {
      m.color?.setHex(OCEAN_GRID);
      m.transparent = true;
      m.opacity = 0.45; // subtle, readable
    }
  });
}

this._createCausticsWash();

    // Fertility overlays
    this._fertilityGroup.name = 'fertility';
    this._fertilityGroup.position.y = 0.004;
    this.scene.add(this._fertilityGroup);

    // Player
    this.player.group.position.copy(this.grid.tileCenter(6, 6)).add(new THREE.Vector3(0, 0.25, 0));
    this.scene.add(this.player.group);

    

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
  // 1x1 unit square; we’ll scale it to fit the tile each frame
  const g = new THREE.PlaneGeometry(1, 1, 1, 1);
  g.rotateX(-Math.PI / 2); // lay flat on the ground

  // pick initial A→B colors based on stage (0->1, 1->2, 2/3 stay green)
  const colorA =
    stage <= 0 ? STAGE0_BABY_BLUE :
    stage === 1 ? STAGE1_SOFT_ORANGE :
    STAGE2_RIPPLE_GREEN;

  const colorB =
    stage <= 0 ? STAGE1_SOFT_ORANGE :
    stage === 1 ? STAGE2_RIPPLE_GREEN :
    STAGE2_RIPPLE_GREEN;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // (normal blending looks nicest over your tile + fertility tint)
    blending: THREE.NormalBlending,
    uniforms: {
      uTime:   { value: 0 },
      uMix:    { value: 0 }, // 0..1 within the current stage
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime;
      uniform float uMix;
      uniform vec3  uColorA;
      uniform vec3  uColorB;

      void main() {
        // Stage color blend
        vec3 base = mix(uColorA, uColorB, clamp(uMix, 0.0, 1.0));

        // Radial ripple centered on tile
        vec2 p = (vUv - 0.5) * 2.0;
        float d = length(p);                 // distance from center
        float rings = 0.5 + 0.5 * sin(10.0 * d - 4.0 * uTime);

        // Subtle vignette to keep edges soft
        float vignette = smoothstep(0.95, 0.3, d);

        // Brightness modulation from ripple
        vec3 color = base * (0.8 + 0.2 * rings);

        // Slight alpha fade toward edges so it sits nicely in the tile
        float alpha = 0.85 * vignette;

        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const mesh = new THREE.Mesh(g, mat);
  (mesh as any).userData.stage = stage; // keep stage for compare/rebuild
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
private _installDreamPoolGround() {
  // Gentle sky tint so the scene isn’t so dark
  const hemi = new THREE.HemisphereLight(0x6D79FF, 0x0B1120, 0.25);
  this.scene.add(hemi);

  const mat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    uniforms: {
      uTime:      { value: 0 },
      uColorA:    { value: new THREE.Color(DREAM_COL_A) },
      uColorB:    { value: new THREE.Color(DREAM_COL_B) },
      uCaus:      { value: new THREE.Color(DREAM_CAUSTICS) },
      uLav:       { value: new THREE.Color(DREAM_LAVENDER) },
      uScale:     { value: DREAM_SCALE },
      uIntensity: { value: DREAM_INTENSITY },
    },
    vertexShader: /* glsl */`
      varying vec2 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xz;                      // world coords on the plane
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vWorld;
      uniform float uTime, uScale, uIntensity;
      uniform vec3  uColorA, uColorB, uCaus, uLav;

      // lightweight sine-based caustics with domain warping (no textures)
      float caustics(vec2 p, float t){
        p *= uScale;                         // scale in world space
        // domain warp (slow swirl)
        vec2 q = p + 0.35 * vec2(
          sin(p.y*1.7 + t*0.35),
          cos(p.x*1.3 - t*0.45)
        );
        // layered interference
        float c = 0.0;
        c += sin(q.x*3.2 + t*0.9)*sin(q.y*2.9 - t*0.7);
        c += 0.5*sin(dot(q, vec2(1.2,-1.1))*2.4 + t*0.6);
        c = abs(c);
        return smoothstep(0.35, 0.95, c);    // thin bright lines
      }

      void main() {
        float t = uTime;

        // dreamy diagonal gradient base
        float g = clamp(0.5 + 0.5 * (vWorld.x + vWorld.y) * 0.05, 0.0, 1.0);
        vec3 base = mix(uColorA, uColorB, g);

        // soft caustics wash (slightly lavender-tinted highlights)
        float c = caustics(vWorld, t);
        vec3 glow = mix(uCaus, uLav, 0.3);
        base += glow * (uIntensity * c);

        gl_FragColor = vec4(base, 1.0);
      }
    `
  });

  this.grid.plane.material = mat;

  // Make grid lines a bit lighter so they read over the dreamy ground
  this.grid.group.traverse(o => {
    const m: any = (o as any).material;
    if (m?.isLineBasicMaterial) {
      m.color?.setHex(0x6D87B3); // misty blue
      m.opacity = 0.35;
      m.transparent = true;
    }
  });
}


// Maps crop stage -> (from color A) -> (to color B)
// 0: baby blue -> soft orange
// 1: soft orange -> ripple green
// 2/3: ripple green -> ripple green (hold green in final stage)
private _stageColors(stage: 0 | 1 | 2 | 3): { a: number; b: number } {
  switch (stage) {
    case 0:
      return { a: STAGE0_BABY_BLUE, b: STAGE1_SOFT_ORANGE };
    case 1:
      return { a: STAGE1_SOFT_ORANGE, b: STAGE2_RIPPLE_GREEN };
    case 2:
    case 3:
    default:
      return { a: STAGE2_RIPPLE_GREEN, b: STAGE2_RIPPLE_GREEN };
  }
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

private tileKey(x:number,y:number) { return `${x},${y}`; }

private getOrCreateFertilityOverlay(x: number, y: number): THREE.Mesh {
  const key = this.tileKey(x, y);
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

  const c = this.grid.tileCenter(x, y);
  mesh.position.set(c.x, 0, c.z);

  this._fertilityGroup.add(mesh);
  this._fertilityOverlays.set(key, mesh);
  return mesh;
}


  /* ============================
     Fertility application/visuals
     ============================ */


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
  const tIdx = this.grid.worldToTile(this.player.group.position);
  if (!tIdx) return;

  // Global “tide” factor, synced across all tiles (no per-tile noise)
  const now = performance.now() * 0.001;
  const phase = (now % FERTILITY_TIDE_PERIOD_SEC) / FERTILITY_TIDE_PERIOD_SEC; // 0..1
  const swell = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2); // smooth 0..1
  const tide  = THREE.MathUtils.lerp(1 - FERTILITY_TIDE_STRENGTH, 1, swell); // e.g. 0.65..1

  const r = NEAR_VIS_RADIUS_TILES;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = tIdx.x + dx, y = tIdx.y + dy;
      if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) continue;

      const tile = this.grid.tiles[y][x] as TileState;
      const f = THREE.MathUtils.clamp(tile.fertility ?? 0, 0, 1);
      const key = this.tileKey(x, y);

      if (f <= 0.001) {
        const mesh = this._fertilityOverlays.get(key);
        if (mesh) (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }

      // Base fertility alpha, gently modulated by the tide
      const mesh = this.getOrCreateFertilityOverlay(x, y);
      const mat  = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = FERTILITY_TINT_ALPHA_MAX * f * tide;

      if (DEBUG_FERTILITY_NUMBERS) {
        const el = this._fertilityTextEls.get(key);
        if (el) {
          const v = this.grid.tileCenter(x, y).clone();
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
    if (remaining <= 0) { this._novaFlashes.delete(key); continue; }

    const [sx, sy] = key.split(',').map(n => parseInt(n, 10));
    if (Number.isNaN(sx) || Number.isNaN(sy)) continue;  // ✅ validate first

    const mesh = this.getOrCreateFertilityOverlay(sx, sy);
    const mat  = mesh.material as THREE.MeshBasicMaterial;

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
      if ((t.fertility ?? 0) > 0) {
        t.fertility = Math.max(0, (t.fertility ?? 0) - decay);
      }
    }
  }

  // Growth progression WITH fertility multiplier (delta-based)
  if (APPLY_GROWTH_TICK) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const tile = grid[y][x] as TileState;
        const c = tile.crop;
        if (!c) continue;

        const before = c.stage;
        const mult = this.growthMultiplierFor(tile);
        c.growthMs = (c.growthMs ?? 0) + dt * mult * 1000 * GROWTH_RATE_MULT;

        while (c.stage < 3 && (c.growthMs ?? 0) >= BASE_STAGE_MS) {
          c.growthMs! -= BASE_STAGE_MS;
          c.stage = (c.stage + 1) as 0 | 1 | 2 | 3;
        }

        // 🌸 NEW: continuous shader update for stage fade
        const stageProgress = Math.max(
          0,
          Math.min(1, (c.growthMs ?? 0) / BASE_STAGE_MS)
        );
        const mesh = this.findCropMesh(x, y) as THREE.Mesh | undefined;
        if (mesh) {
          const sm = mesh.material as unknown as THREE.ShaderMaterial;
          if ((sm as any)?.isShaderMaterial) {
            if (sm.uniforms?.uMix) sm.uniforms.uMix.value = stageProgress;

            const prevStage = (mesh as any).userData?.stage;
            if (prevStage !== c.stage) {
              const { a, b } = this._stageColors(c.stage);
              if (sm.uniforms?.uColorA) sm.uniforms.uColorA.value.setHex(a);
              if (sm.uniforms?.uColorB) sm.uniforms.uColorB.value.setHex(b);
              if (sm.uniforms?.uMix) sm.uniforms.uMix.value = 0.0;
              (mesh as any).userData.stage = c.stage;
            }
          }
        }

        // On first frame reaching stage 3, register shimmer emitter
        if (before !== 3 && c.stage === 3) {
          const key = this.cropKey(x, y);
          this._bloomEmitters.set(key, performance.now() * 0.001);
        }
      }
    }
  }

  // Emit shimmers from any stage-3 plants on their cadence
  this.updateBloomEmitters(grid);

  // Try a Garden Bloom (scale threshold + cooldown)
  this.tryTriggerBloom(dt, grid);

  // Fertility tint & Bloom flashes
  this.updateFertilityVisualsAroundPlayer();
  this.updateBloomFlashes(dt);

  // Update particle FX
  this.updateShimmers(dt);
  this.updateAbsorptions(dt);

  // Player + trail
  this._movePlayer(dt);
  this.player.updateGlow(performance.now() / 1000);

  // Star easing & UI
  this._updateStarScale(dt);
  this.updateConstellationMeterUI();

  // Stardust trail sim
  this._trail.update(dt);

  // Drive ripple time on crop square shaders
  const tNow = performance.now() * 0.001;
  const gmat: any = this.grid.plane.material;
if (gmat?.isShaderMaterial && gmat.uniforms?.uTime) {
  gmat.uniforms.uTime.value = tNow;
}

  this._tickCropShaders(tNow);
this._tickCausticsWash(tNow);

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
