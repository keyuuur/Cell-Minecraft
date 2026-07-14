export class FixedGrid {
  readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly depth: number,
  ) {
    this.cells = new Uint8Array(width * height * depth);
  }

  get(x: number, y: number, z: number): number {
    return this.cells[this.index(x, y, z)];
  }

  set(x: number, y: number, z: number, value: number): void {
    this.cells[this.index(x, y, z)] = value;
  }

  clear(): void {
    this.cells.fill(0);
  }

  private index(x: number, y: number, z: number): number {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z) ||
      x < 0 ||
      y < 0 ||
      z < 0 ||
      x >= this.width ||
      y >= this.height ||
      z >= this.depth
    ) {
      throw new RangeError(
        `Grid coordinate outside ${this.width} × ${this.height} × ${this.depth}.`,
      );
    }
    return x + this.width * (z + this.depth * y);
  }
}
