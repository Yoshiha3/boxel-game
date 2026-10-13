/**
 * ブロックの破壊・設置のルール（純粋関数）。
 */
import { AIR } from '../core/constants.js';
import { makeBox } from '../physics/aabb.js';

/** ブロックに手が届く距離 */
export const REACH = 5;

/**
 * レイキャストの対象になるブロックか（空気と液体は通り抜ける）。
 * @param {import('../core/registry.js').Registry} registry
 * @param {number} id
 * @returns {boolean}
 */
export function isTargetable(registry, id) {
  return id !== AIR && !registry.liquid[id];
}

/**
 * ブロックを壊す。壊せないブロック（breakable: false）なら何もしない。
 * @param {import('../world/world.js').World} world
 * @param {number[]} pos ブロックの座標
 * @returns {boolean} 壊したら true
 */
export function breakBlock(world, pos) {
  const id = world.getBlock(pos[0], pos[1], pos[2]);
  if (id === AIR || !world.registry.block(id).breakable) return false;
  return world.setBlock(pos[0], pos[1], pos[2], AIR);
}

/**
 * ブロックを置く。置ける場所は空気か液体のマスで、固体ブロックの場合はエンティティと重ならないこと。
 * @param {import('../world/world.js').World} world
 * @param {number[]} pos 置く座標
 * @param {number} id 置くブロック
 * @param {{pos: number[], size: number[]}[]} entities 重なりを調べるエンティティ
 * @returns {boolean} 置いたら true
 */
export function placeBlock(world, pos, id, entities) {
  const [x, y, z] = pos;
  const current = world.getBlock(x, y, z);
  if (current !== AIR && !world.registry.liquid[current]) return false;
  if (world.registry.solid[id]) {
    for (const e of entities) {
      const b = makeBox(e.pos, e.size);
      const overlaps = b.min[0] < x + 1 && b.max[0] > x && b.min[1] < y + 1 && b.max[1] > y && b.min[2] < z + 1 && b.max[2] > z;
      if (overlaps) return false;
    }
  }
  return world.setBlock(x, y, z, id);
}
