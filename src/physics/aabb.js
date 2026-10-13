/**
 * 軸に平行な直方体（AABB）とボクセルの衝突判定（純粋関数）。
 * エンティティの位置は「足元の中心」で表す。
 */

const EPS = 1e-6;
const AXES = [0, 1, 2];

/**
 * 足元の中心とサイズから AABB を作る。
 * @param {number[]} pos [x, y, z] 足元の中心
 * @param {number[]} size [幅X, 高さ, 幅Z]
 * @returns {{min: number[], max: number[]}}
 */
export function makeBox(pos, size) {
  return {
    min: [pos[0] - size[0] / 2, pos[1], pos[2] - size[2] / 2],
    max: [pos[0] + size[0] / 2, pos[1] + size[1], pos[2] + size[2] / 2],
  };
}

/**
 * 箱の断面（axis 以外の2軸）が重なるセルに、固体ブロックがあるか。
 * @param {(x: number, y: number, z: number) => boolean} isSolid
 * @param {{min: number[], max: number[]}} box
 * @param {number} axis 調べる軸
 * @param {number} c その軸のセル座標
 * @returns {boolean}
 */
function solidInSlice(isSolid, box, axis, c) {
  const [a, b] = AXES.filter((x) => x !== axis);
  const a0 = Math.floor(box.min[a] + EPS), a1 = Math.floor(box.max[a] - EPS);
  const b0 = Math.floor(box.min[b] + EPS), b1 = Math.floor(box.max[b] - EPS);
  const cell = [0, 0, 0];
  cell[axis] = c;
  for (let i = a0; i <= a1; i++) {
    for (let j = b0; j <= b1; j++) {
      cell[a] = i;
      cell[b] = j;
      if (isSolid(cell[0], cell[1], cell[2])) return true;
    }
  }
  return false;
}

/**
 * 1軸だけ箱を動かし、固体ブロックに当たる手前で止めた移動量を返す。
 * @param {(x: number, y: number, z: number) => boolean} isSolid
 * @param {{min: number[], max: number[]}} box
 * @param {number} axis 0=X, 1=Y, 2=Z
 * @param {number} d 動かしたい量
 * @returns {number} 実際に動ける量
 */
export function sweepAxis(isSolid, box, axis, d) {
  if (d > 0) {
    const edge = box.max[axis];
    const end = Math.ceil(edge + d) - 1;
    for (let c = Math.ceil(edge - EPS); c <= end; c++) {
      if (solidInSlice(isSolid, box, axis, c)) return Math.min(d, Math.max(0, c - edge));
    }
  } else if (d < 0) {
    const edge = box.min[axis];
    const end = Math.floor(edge + d);
    for (let c = Math.floor(edge + EPS) - 1; c >= end; c--) {
      if (solidInSlice(isSolid, box, axis, c)) return Math.max(d, Math.min(0, c + 1 - edge));
    }
  }
  return d;
}

/**
 * 箱を Y → X → Z の順に動かし、ブロックとの衝突を解決する。
 * @param {(x: number, y: number, z: number) => boolean} isSolid 整数座標のブロックが固体か
 * @param {number[]} pos 足元の中心（書き換える）
 * @param {number[]} size [幅X, 高さ, 幅Z]
 * @param {number[]} delta 動かしたい量 [dx, dy, dz]
 * @returns {{hit: boolean[], onGround: boolean}} 各軸で当たったか、下向きに当たって着地したか
 */
export function moveWithCollision(isSolid, pos, size, delta) {
  const hit = [false, false, false];
  for (const axis of [1, 0, 2]) {
    const box = makeBox(pos, size);
    const moved = sweepAxis(isSolid, box, axis, delta[axis]);
    if (moved !== delta[axis]) hit[axis] = true;
    pos[axis] += moved;
  }
  return { hit, onGround: hit[1] && delta[1] < 0 };
}

/**
 * 箱と重なるブロックのうち、条件を満たすものがあるか。
 * @param {(x: number, y: number, z: number) => boolean} test
 * @param {{min: number[], max: number[]}} box
 * @returns {boolean}
 */
export function boxTouches(test, box) {
  for (let x = Math.floor(box.min[0] + EPS); x <= Math.floor(box.max[0] - EPS); x++) {
    for (let y = Math.floor(box.min[1] + EPS); y <= Math.floor(box.max[1] - EPS); y++) {
      for (let z = Math.floor(box.min[2] + EPS); z <= Math.floor(box.max[2] - EPS); z++) {
        if (test(x, y, z)) return true;
      }
    }
  }
  return false;
}
