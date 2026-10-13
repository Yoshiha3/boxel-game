/**
 * template: データに書いたブロックの並びをそのまま置く構造物ジェネレータ。
 * blocks は [dx, dy, dz, "ブロックID"] の配列（起点 = 地表の1つ上からの相対座標）。
 */
export default {
  type: 'template',
  defaults: {
    blocks: [],
  },
  /**
   * @param {any} def
   * @param {(id: string) => boolean} hasBlock
   * @param {string[]} errors
   */
  validate(def, hasBlock, errors) {
    def.blocks.forEach((b, i) => {
      if (!Array.isArray(b) || b.length !== 4 || !b.slice(0, 3).every(Number.isInteger)) {
        errors.push(`structure "${def.id}": blocks[${i}] must be [dx, dy, dz, "block"]`);
      } else if (!hasBlock(b[3])) {
        errors.push(`structure "${def.id}": unknown block "${b[3]}" in blocks[${i}]`);
      }
    });
  },
  /**
   * @param {any} def
   * @returns {number}
   */
  extent(def) {
    return def.blocks.reduce((m, b) => Math.max(m, Math.abs(b[0]), Math.abs(b[2])), 0);
  },
  /**
   * @param {any} def
   * @param {() => number} rand
   * @param {(id: string) => number} blockId
   */
  build(def, rand, blockId) {
    return def.blocks.map(([dx, dy, dz, id]) => ({ dx, dy, dz, id: blockId(id) }));
  },
};
