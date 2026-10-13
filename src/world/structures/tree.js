/**
 * tree: 幹と葉からなる木を作る構造物ジェネレータ。
 * - 幹: 高さを height の範囲で乱数で決める
 * - 樹冠: 幹の先端を中心にした、横に広く縦に低い楕円体。木ごとに x と z の広がりを乱数で少し変え、
 *   ふち（中心からの距離が edgeStart を超える所）は edgeGap の確率で欠けさせて、でこぼこにする
 * - 枝: branches の範囲の本数だけ、幹の途中から斜め上に伸び、先に小さな葉の塊を付ける
 */

/** 枝を伸ばす水平方向 */
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** 木ごとの樹冠の広がりの倍率の幅（1 ± STRETCH） */
const STRETCH = 0.15;
/** 枝の先の葉の塊の半径 */
const BRANCH_LEAF_RADIUS = 1.5;

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
    height: [5, 7],
    /** 樹冠の水平方向の半径 */
    leafRadius: 3,
    /** 樹冠の上下方向の半径 */
    crownHeight: 2,
    /** ふちとみなす、中心からの距離（楕円体の半径を 1 としたときの2乗） */
    edgeStart: 0.6,
    /** ふちの葉を欠けさせる確率 */
    edgeGap: 0.4,
    /** 枝の本数の範囲 [最小, 最大] */
    branches: [0, 2],
    /** 枝の長さ（水平方向のブロック数） */
    branchLength: 3,
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
    const range = (key, lowest) => {
      const [min, max] = def[key];
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < lowest || min > max) {
        errors.push(`structure "${def.id}": "${key}" must be [min, max] integers with ${lowest} <= min <= max`);
      }
    };
    range('height', 1);
    range('branches', 0);
    for (const key of ['leafRadius', 'crownHeight']) {
      if (!(def[key] > 0)) errors.push(`structure "${def.id}": "${key}" must be positive`);
    }
    for (const key of ['edgeStart', 'edgeGap']) {
      if (!(def[key] >= 0 && def[key] <= 1)) errors.push(`structure "${def.id}": "${key}" must be 0..1`);
    }
    if (!Number.isInteger(def.branchLength) || def.branchLength < 1) {
      errors.push(`structure "${def.id}": "branchLength" must be a positive integer`);
    }
  },
  /**
   * 起点から水平方向に何ブロックまで広がるか。
   * @param {any} def
   * @returns {number}
   */
  extent(def) {
    const crown = Math.floor(def.leafRadius * (1 + STRETCH));
    const branch = def.branches[1] > 0 ? def.branchLength + Math.floor(BRANCH_LEAF_RADIUS) : 0;
    return Math.max(crown, branch);
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
    const randInt = ([min, max]) => min + Math.floor(rand() * (max - min + 1));
    const h = randInt(def.height);
    const out = [];
    if (def.soil) out.push({ dx: 0, dy: -1, dz: 0, id: blockId(def.soil), force: true });
    for (let dy = 0; dy < h; dy++) out.push({ dx: 0, dy, dz: 0, id: trunk });

    // 樹冠: 幹の先端（dy = h - 1）を中心にした楕円体
    const rx = def.leafRadius * (1 - STRETCH + rand() * 2 * STRETCH);
    const rz = def.leafRadius * (1 - STRETCH + rand() * 2 * STRETCH);
    const ry = def.crownHeight;
    const cy = h - 1;
    for (let dy = Math.ceil(cy - ry); dy <= Math.floor(cy + ry); dy++) {
      for (let dx = -Math.floor(rx); dx <= Math.floor(rx); dx++) {
        for (let dz = -Math.floor(rz); dz <= Math.floor(rz); dz++) {
          const d = (dx / rx) ** 2 + ((dy - cy) / ry) ** 2 + (dz / rz) ** 2;
          if (d > 1) continue;
          if (d > def.edgeStart && rand() < def.edgeGap) continue;
          out.push({ dx, dy, dz, id: leaves });
        }
      }
    }

    // 枝: 樹冠の下あたりから、別々の向きに斜め上へ伸ばし、先に小さな葉の塊を付ける（樹冠の横から少しはみ出す）
    const dirs = [...DIRECTIONS];
    const count = Math.min(randInt(def.branches), dirs.length);
    for (let i = 0; i < count; i++) {
      const [ux, uz] = dirs.splice(Math.floor(rand() * dirs.length), 1)[0];
      const start = Math.max(1, h - 1 - def.branchLength - Math.floor(rand() * 2));
      let x = 0, y = start, z = 0;
      for (let step = 1; step <= def.branchLength; step++) {
        x = ux * step;
        z = uz * step;
        y = start + step;
        out.push({ dx: x, dy: y, dz: z, id: trunk });
      }
      const r = Math.floor(BRANCH_LEAF_RADIUS);
      for (let ly = 0; ly <= 1; ly++) {
        for (let lx = -r; lx <= r; lx++) {
          for (let lz = -r; lz <= r; lz++) {
            if (lx * lx + ly * ly + lz * lz > BRANCH_LEAF_RADIUS ** 2) continue;
            out.push({ dx: x + lx, dy: y + ly, dz: z + lz, id: leaves });
          }
        }
      }
    }
    return out;
  },
};
