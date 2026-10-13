/**
 * テクスチャアトラスの配置計算（DOM に依存しない純粋関数）。
 */

/**
 * タイル数からアトラスの列数・行数を決める（できるだけ正方形にする）。
 * @param {number} count タイル数
 * @returns {{cols: number, rows: number}}
 */
export function atlasGrid(count) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows };
}

/**
 * 各タイルの UV 範囲の表を作る。
 * three.js のテクスチャは flipY=true なので、画像の上端が v=1 になる。
 * @param {number} count タイル数
 * @returns {Float32Array} タイル番号 * 4 → [u0, v0, u1, v1]
 */
export function buildTileUVs(count) {
  const { cols, rows } = atlasGrid(count);
  const uvs = new Float32Array(count * 4);
  for (let t = 0; t < count; t++) {
    const col = t % cols;
    const row = Math.floor(t / cols);
    uvs[t * 4] = col / cols;
    uvs[t * 4 + 1] = 1 - (row + 1) / rows;
    uvs[t * 4 + 2] = (col + 1) / cols;
    uvs[t * 4 + 3] = 1 - row / rows;
  }
  return uvs;
}
