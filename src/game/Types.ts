export type Tool = 'plant';

export interface TileState {
  x: number;
  y: number;
  type: 'soil' | 'grass';
  crop?: {
    kind: 'wheat';
    plantedAt: number;
    /** Stage 0..3 for visuals */
    stage: 0 | 1 | 2 | 3;
    /** Accumulated effective growth time in ms (dt * multiplier). */
    growthMs?: number;
  };
  /** Stardust Fertility scalar (0..1). Default 0 when unset. */
  fertility?: number;
}
