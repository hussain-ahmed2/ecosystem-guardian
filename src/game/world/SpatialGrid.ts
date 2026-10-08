import type { Vec2 } from '@/types/world'

/**
 * Uniform-grid spatial index for proximity queries (predator/prey,
 * picking, culling). Rebuilt on demand — it is transient and never
 * part of game state.
 */
export class SpatialGrid {
  readonly cellSize: number
  private readonly cols: number
  private readonly rows: number
  private readonly cells: string[][]

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = Math.max(1, cellSize)
    this.cols = Math.max(1, Math.ceil(width / this.cellSize))
    this.rows = Math.max(1, Math.ceil(height / this.cellSize))
    this.cells = new Array<string[]>(this.cols * this.rows)
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = []
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = []
  }

  insert(id: string, x: number, y: number): void {
    const index = this.indexOf(x, y)
    this.cells[index]?.push(id)
  }

  private indexOf(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)))
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)))
    return cy * this.cols + cx
  }

  /** ids of cells overlapping a circle */
  query(x: number, y: number, radius: number): string[] {
    const minCx = Math.max(0, Math.floor((x - radius) / this.cellSize))
    const maxCx = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize))
    const minCy = Math.max(0, Math.floor((y - radius) / this.cellSize))
    const maxCy = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize))
    const out: string[] = []
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells[cy * this.cols + cx]
        if (cell) out.push(...cell)
      }
    }
    return out
  }

  queryPosition(pos: Vec2, radius: number): string[] {
    return this.query(pos.x, pos.y, radius)
  }
}
