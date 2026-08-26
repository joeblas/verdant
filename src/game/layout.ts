export function plotPosition(index: number): [number, number, number] {
  const row = Math.floor(index / 4);
  const col = index % 4;
  return [(col - 1.5) * 2.2, 0, (row - 1.5) * 2.2];
}
