/**
 * スポーン地点の決定。
 */

/**
 * 原点の近くで、地表が海面以上（水に沈んでいない）の場所を探す。
 * 原点から外側へ正方形の輪を広げながら探し、見つからなければ原点を使う。
 * 洞窟で地表が削られている場所は選ばない。
 * @param {{heightAt: (x: number, z: number) => number, seaLevel: number, isCarved?: (x: number, y: number, z: number) => boolean}} terrain
 * @param {number} [maxRadius] 探す範囲（ブロック）
 * @param {number} [step] 探す間隔（ブロック）
 * @returns {number[]} 足元の中心 [x, y, z]
 */
export function findSpawn(terrain, maxRadius = 512, step = 4) {
  for (let r = 0; r <= maxRadius; r += step) {
    for (let dx = -r; dx <= r; dx += step) {
      for (let dz = -r; dz <= r; dz += step) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const h = terrain.heightAt(dx, dz);
        if (h >= terrain.seaLevel && !terrain.isCarved?.(dx, h, dz)) return [dx + 0.5, h + 1, dz + 0.5];
      }
    }
  }
  return [0.5, terrain.heightAt(0, 0) + 1, 0.5];
}
