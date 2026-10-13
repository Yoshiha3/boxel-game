/**
 * ボクセルのレイキャスト（DDA 法。純粋関数）。
 * 視線の先で最初に当たるブロックと、当たった面の向きを求める。
 */

/**
 * レイを進め、isTarget が true を返す最初のブロックを探す。
 * @param {(x: number, y: number, z: number) => boolean} isTarget
 * @param {number[]} origin 始点 [x, y, z]
 * @param {number[]} dir 方向（正規化されていなくてよい）
 * @param {number} maxDistance 最大距離（ブロック）
 * @returns {{block: number[], normal: number[], distance: number} | null}
 *   block: 当たったブロックの座標、normal: 当たった面の外向き法線（始点がブロック内なら [0,0,0]）
 */
export function raycast(isTarget, origin, dir, maxDistance) {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len === 0) return null;
  const d = dir.map((v) => v / len);
  const cell = origin.map(Math.floor);
  const step = d.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0));
  // 次のセル境界までの距離（t）と、1セル進むごとの t の増分
  const tDelta = d.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
  const tMax = d.map((v, i) => {
    if (v === 0) return Infinity;
    const boundary = v > 0 ? cell[i] + 1 : cell[i];
    return (boundary - origin[i]) / v;
  });
  const normal = [0, 0, 0];
  let t = 0;
  while (t <= maxDistance) {
    if (isTarget(cell[0], cell[1], cell[2])) {
      return { block: [...cell], normal: [...normal], distance: t };
    }
    // 一番近い境界の軸へ進む
    let axis = 0;
    if (tMax[1] < tMax[axis]) axis = 1;
    if (tMax[2] < tMax[axis]) axis = 2;
    t = tMax[axis];
    cell[axis] += step[axis];
    tMax[axis] += tDelta[axis];
    normal[0] = normal[1] = normal[2] = 0;
    normal[axis] = -step[axis];
  }
  return null;
}
