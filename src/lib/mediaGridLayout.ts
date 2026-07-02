export type GridCell = {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

/** WhatsApp-style album tile layout for 1–4 visible cells (+ overflow badge). */
export function computeAlbumGrid(
  count: number,
  containerWidth: number,
  containerHeight: number,
  gap = 3
): GridCell[] {
  if (count <= 0) return [];
  const W = containerWidth;
  const H = containerHeight;

  if (count === 1) {
    return [{ index: 0, left: 0, top: 0, width: W, height: H }];
  }

  if (count === 2) {
    const w = (W - gap) / 2;
    return [
      { index: 0, left: 0, top: 0, width: w, height: H },
      { index: 1, left: w + gap, top: 0, width: w, height: H },
    ];
  }

  if (count === 3) {
    const leftW = (W - gap) * 0.55;
    const rightW = W - leftW - gap;
    const rightH = (H - gap) / 2;
    return [
      { index: 0, left: 0, top: 0, width: leftW, height: H },
      { index: 1, left: leftW + gap, top: 0, width: rightW, height: rightH },
      { index: 2, left: leftW + gap, top: rightH + gap, width: rightW, height: rightH },
    ];
  }

  const cols = 2;
  const rows = 2;
  const cellW = (W - gap) / cols;
  const cellH = (H - gap) / rows;
  const visible = Math.min(count, 4);
  const cells: GridCell[] = [];

  for (let i = 0; i < visible; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    cells.push({
      index: i,
      left: col * (cellW + gap),
      top: row * (cellH + gap),
      width: cellW,
      height: cellH,
    });
  }

  return cells;
}
