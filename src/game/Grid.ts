import * as THREE from 'three';
import type { TileState } from './Types';

export class Grid {
  public group = new THREE.Group();
  public tiles: TileState[][];
  public tileSize: number;
  public width: number;
  public height: number;
  private _plane: THREE.Mesh;
  private _tileHighlight: THREE.Mesh;

  constructor(width = 12, height = 12, tileSize = 1) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;

    // Base ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width * tileSize, height * tileSize, width, height),
      new THREE.MeshStandardMaterial({ color: 0x264d2f, roughness: 1.0, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    this._plane = ground;

    // Grid lines
    const gridHelper = new THREE.GridHelper(width * tileSize, width, 0x335544, 0x335544);
    (gridHelper.material as THREE.LineBasicMaterial).transparent = true;
    (gridHelper.material as THREE.LineBasicMaterial).opacity = 0.35;
    gridHelper.position.set(0, 0.002, 0);
    this.group.add(gridHelper);

    // Highlight tile
    const highlightGeom = new THREE.PlaneGeometry(tileSize, tileSize);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    this._tileHighlight = new THREE.Mesh(highlightGeom, highlightMat);
    this._tileHighlight.rotation.x = -Math.PI / 2;
    this._tileHighlight.position.y = 0.005;
    this._tileHighlight.visible = false;
    this.group.add(this._tileHighlight);

    // Tiles state
    this.tiles = [];
    for (let y = 0; y < height; y++) {
      const row: TileState[] = [];
      for (let x = 0; x < width; x++) {
        row.push({ x, y, type: 'soil' });
      }
      this.tiles.push(row);
    }
  }

  worldToTile(point: THREE.Vector3): { x: number, y: number } | null {
    const halfW = (this.width * this.tileSize) / 2;
    const halfH = (this.height * this.tileSize) / 2;
    const gx = point.x + halfW;
    const gz = point.z + halfH;
    if (gx < 0 || gz < 0 || gx >= this.width * this.tileSize || gz >= this.height * this.tileSize) return null;
    const x = Math.floor(gx / this.tileSize);
    const y = Math.floor(gz / this.tileSize);
    return { x, y };
  }

  tileCenter(x: number, y: number): THREE.Vector3 {
    const halfW = (this.width * this.tileSize) / 2;
    const halfH = (this.height * this.tileSize) / 2;
    return new THREE.Vector3(
      -halfW + x * this.tileSize + this.tileSize / 2,
      0,
      -halfH + y * this.tileSize + this.tileSize / 2
    );
  }

  setHighlight(x: number, y: number) {
    this._tileHighlight.visible = true;
    const c = this.tileCenter(x, y);
    this._tileHighlight.position.set(c.x, 0.005, c.z);
  }

  hideHighlight() {
    this._tileHighlight.visible = false;
  }

  get plane(): THREE.Mesh {
    return this._plane;
  }
}
