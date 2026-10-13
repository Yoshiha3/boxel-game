/**
 * 液体の判定（純粋関数）。
 */
import { LIQUID_SURFACE_HEIGHT } from '../render/mesher.js';

/**
 * 点が液体の中にあるかを判定し、その液体のブロックIDを返す。
 * 水面のブロック（上が液体でない）は、見た目と合わせて高さ LIQUID_SURFACE_HEIGHT までを液体とみなす。
 * @param {(x: number, y: number, z: number) => number} getBlock
 * @param {Uint8Array} liquidTable registry.liquid
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number} 液体のブロックID（液体の外なら 0）
 */
export function liquidAt(getBlock, liquidTable, x, y, z) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const id = getBlock(bx, by, bz);
  if (!liquidTable[id]) return 0;
  const surface = !liquidTable[getBlock(bx, by + 1, bz)];
  if (surface && y - by > LIQUID_SURFACE_HEIGHT) return 0;
  return id;
}
