export type Tool = 'plant' | 'harvest' | 'plow';

export interface TileState {
  x: number;
  y: number;
  type: 'soil' | 'grass';
  crop?: {
    kind: 'wheat';
    plantedAt: number; // epoch ms
    stage: 0 | 1 | 2 | 3; // growth stages
  };
}
