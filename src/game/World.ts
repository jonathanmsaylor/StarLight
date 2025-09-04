import * as THREE from 'three';
import { Grid } from './Grid';
import type { TileState, Tool } from './Types';
import { Player } from './Player';
import { Stardust } from './Stardust';
import { getMoveVector } from './Input';

export class World {
  public scene = new THREE.Scene();
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public raycaster = new THREE.Raycaster();
  public mouse = new THREE.Vector2();
  public grid: Grid;
  public day = 1;
  public minutes = 6 * 60; // start 06:00
  public tool: Tool = 'plant';

  private _clock = new THREE.Clock();
  private _dirLight: THREE.DirectionalLight;
  private _ambient: THREE.AmbientLight;

  public player = new Player();
  private _trail = new Stardust();
  private _camOffset = new THREE.Vector3(6, 10, 8);

  constructor(private container: HTMLElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Scene background
    this.scene.background = new THREE.Color(0x0a0f17);

    // Camera (same angle)
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 100);

    // Lights
    this._ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this._ambient);

    this._dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this._dirLight.position.set(8, 12, 6);
    this._dirLight.castShadow = false;
    this.scene.add(this._dirLight);

    // Grid
    this.grid = new Grid(12, 12, 1);
    this.scene.add(this.grid.group);

    // Player start
    this.player.group.position.copy(this.grid.tileCenter(6, 6)).add(new THREE.Vector3(0, 0.25, 0));
    this.scene.add(this.player.group);

    // Stardust trail
    this.scene.add(this._trail.points);

    // Initial camera follow
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
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const hit = this.raycaster.intersectObject(this.grid.plane, false)[0];
    return hit ? hit.point : null;
  }

  // (unchanged crop helpers omitted for brevity — keep your existing ones)
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
  plant(x:number,y:number, state: TileState) {
    if (state.crop) return false;
    state.crop = { kind:'wheat', plantedAt: Date.now(), stage: 0 };
    const mesh = this.createCropMesh(0);
    const c = this.grid.tileCenter(x,y);
    mesh.position.set(c.x, 0.002, c.z);
    (mesh as any).userData = { key: this.cropKey(x,y) };
    this.getCropsGroup().add(mesh);
    return true;
  }
  harvest(x:number,y:number, state: TileState) {
    if (!state.crop || state.crop.stage < 3) return false;
    const m = this.findCropMesh(x,y);
    if (m) m.parent?.remove(m);
    state.crop = undefined;
    return true;
  }
  plow(x:number,y:number, state: TileState) {
    const m = this.findCropMesh(x,y);
    if (m) m.parent?.remove(m);
    state.crop = undefined;
    return true;
  }
  updateCropsVisuals(grid: TileState[][]) {
    const group = this.getCropsGroup();
    for (let y=0; y<grid.length; y++) {
      for (let x=0; x<grid[0].length; x++) {
        const t = grid[y][x];
        if (!t.crop) continue;
        const expectedHeight = [0.05, 0.15, 0.28, 0.42][t.crop.stage];
        const existing = this.findCropMesh(x,y);
        if (existing) {
          const currentHeight = (existing as any).geometry?.parameters?.height ?? 0;
          if (Math.abs(currentHeight - expectedHeight) > 0.01) {
            group.remove(existing);
            const mesh = this.createCropMesh(t.crop.stage);
            const c = this.grid.tileCenter(x,y);
            mesh.position.set(c.x, 0.002, c.z);
            (mesh as any).userData = { key: this.cropKey(x,y) };
            group.add(mesh);
          }
        } else {
          const mesh = this.createCropMesh(t.crop.stage);
          const c = this.grid.tileCenter(x,y);
          mesh.position.set(c.x, 0.002, c.z);
          (mesh as any).userData = { key: this.cropKey(x,y) };
          group.add(mesh);
        }
      }
    }
  }

  private _movePlayer(dt:number) {
    // Camera-relative movement (WASD + joystick)
    const dir = getMoveVector(this);
    if (dir.lengthSq() > 0) dir.multiplyScalar(this.player.speed * dt);

    // Keep player within grid bounds
    const halfW = (this.grid.width * this.grid.tileSize) / 2;
    const halfH = (this.grid.height * this.grid.tileSize) / 2;
    const margin = 0.5;

    const nx = THREE.MathUtils.clamp(this.player.group.position.x + dir.x, -halfW + margin, halfW - margin);
    const nz = THREE.MathUtils.clamp(this.player.group.position.z + dir.z, -halfH + margin, halfH - margin);

    // Slower, subtler hover (reduced amplitude & frequency)
    const time = performance.now() * 0.001;         // slower than before
    const ny = 0.25 + Math.sin(time * 1.2) * 0.006; // small bob

    // Stardust when moving
    if (dir.lengthSq() > 0) {
      this._trail.spawn(this.player.group.position.x, this.player.group.position.y, this.player.group.position.z);
    }

    this.player.group.position.set(nx, ny, nz);

    // Camera follow (same offset/angle)
    const target = new THREE.Vector3().copy(this.player.group.position).add(this._camOffset);
    this.camera.position.lerp(target, 0.18);
    this.camera.lookAt(this.player.group.position);
  }

  tick(grid: TileState[][]) {
    const dt = this._clock.getDelta();

    // Time of day
    this.minutes += dt * 60;
    while (this.minutes >= 24 * 60) { this.minutes -= 24 * 60; this.day += 1; }

    // Lighting day/night
    const t = (this.minutes / (24*60));
    const daylight = Math.max(0.2, Math.sin((t - 0.25) * Math.PI * 2) * 0.8 + 0.2);
    this._ambient.intensity = 0.30 + daylight * 0.4;
    this._dirLight.intensity = 0.7 + daylight * 0.6;
    this._dirLight.position.set(Math.cos(t*Math.PI*2)*8, 8 + daylight*8, Math.sin(t*Math.PI*2)*8);

    // Crop growth (unchanged)
    const now = Date.now();
    const stageDurMs = 6 * 60 * 1000;
    for (let y=0; y<grid.length; y++) {
      for (let x=0; x<grid[0].length; x++) {
        const tile = grid[y][x];
        if (!tile.crop) continue;
        const elapsed = now - tile.crop.plantedAt;
        const newStage = Math.min(3, Math.floor(elapsed / stageDurMs));
        if (newStage !== tile.crop.stage) tile.crop.stage = newStage as 0|1|2|3;
      }
    }
    this.updateCropsVisuals(grid);

    // Player + trail
    this._movePlayer(dt);
    this.player.updateGlow(performance.now()/1000);
    this._trail.update(dt);

    this.renderer.render(this.scene, this.camera);
  }
}
