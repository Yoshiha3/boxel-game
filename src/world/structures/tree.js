/**
 * tree: 幹と葉からなる木を作る構造物ジェネレータ。
 * 幹の高さは height の範囲で乱数で決め、葉は幹の上部に広葉樹の形で付ける。
 */
export default {
  type: 'tree',
  defaults: {
    /** 幹のブロック */
    trunk: 'log',
    /** 葉のブロック */
    leaves: 'leaves',
    /** 根元の地面を置き換えるブロック（空文字なら置き換えない） */
    soil: 'dirt',
    /** 幹の高さの範囲 [最小, 最大] */
    height: [4, 6],
    /** 葉の広がり（幹からの水平距離） */
    leafRadius: 2,
  },
  /**
   * 種類固有の検証。
   * @param {any} def 既定値を補った定義
   * @param {(id: string) => boolean} hasBlock
   * @param {string[]} errors
   */
  validate(def, hasBlock, errors) {
    for (const key of ['trunk', 'leaves']) {
      if (!hasBlock(def[key])) errors.push(`structure "${def.id}": unknown block "${def[key]}" in "${key}"`);
    }
    if (def.soil && !hasBlock(def.soil)) errors.push(`structure "${def.id}": unknown block "${def.soil}" in "soil"`);
    const [min, max] = def.height;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) {
      errors.push(`structure "${def.id}": "height" must be [min, max] integers with 1 <= min <= max`);
    }
  },
  /**
   * 起点から水平方向に何ブロックまで広がるか。
   * @param {any} def
   * @returns {number}
   */
  extent(def) {
    return def.leafRadius;
  },
  /**
   * 置くブロックの一覧を作る。座標は起点（地表の1つ上）からの相対座標。
   * @param {any} def
   * @param {() => number} rand 0〜1 の乱数
   * @param {(id: string) => number} blockId 文字列ID → 数値ID
   * @returns {{dx: number, dy: number, dz: number, id: number, force?: boolean}[]}
   */
  build(def, rand, blockId) {
    const trunk = blockId(def.trunk);
    const leaves = blockId(def.leaves);
    const [min, max] = def.height;
    const h = min + Math.floor(rand() * (max - min + 1));
    const r = def.leafRadius;
    const out = [];
    if (def.soil) out.push({ dx: 0, dy: -1, dz: 0, id: blockId(def.soil), force: true });
    for (let dy = 0; dy < h; dy++) out.push({ dx: 0, dy, dz: 0, id: trunk });
    // 葉: 下の2段は半径 r、上の2段は半径 r - 1。角は乱数で欠けさせて丸く見せる
    for (let dy = h - 2; dy <= h + 1; dy++) {
      const radius = dy < h ? r : Math.max(1, r - 1);
      const top = dy === h + 1;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (corner && (top || rand() < 0.5)) continue;
          out.push({ dx, dy, dz, id: leaves });
        }
      }
    }
    return out;
  },
};
