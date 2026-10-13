/**
 * waterPhysics: 液体の中での動き。
 * - 体（足元から lowerBodyHeight の高さ）が液体の中なら inLiquid とする
 * - 液体の中では移動が遅くなり、重力が弱く（ゆっくり沈む）、落下の終端速度も小さい
 * - jump を押していると浮上する。目が水面より上なら小さく跳ねる（水面で上下に揺れる）
 * - 液体の中で壁に当たりながら jump を押すと、壁を登るように持ち上がる（岸に上がれる）。
 *   足が最後に液体に触れていた高さから climbHeight までは、液体を出たあとも登り続けられる
 * - 飛行中は液体の影響を受けない
 */
import { liquidAt } from '../../physics/liquid.js';

export default {
  name: 'waterPhysics',
  order: 10,
  defaults: {
    /** 液体の中にいるかを判定する高さ（足元から） */
    lowerBodyHeight: 0.4,
    /** 移動速度の倍率 */
    moveScale: 0.5,
    /** 液体の中の重力加速度（ブロック/秒²） */
    gravity: 8,
    /** 沈む速さの上限（ブロック/秒） */
    maxSinkSpeed: 2,
    /** 縦方向の速度の減衰（1/秒） */
    drag: 3,
    /** 水中で jump を押しているときの浮上の速さ（ブロック/秒） */
    swimUpSpeed: 3,
    /** 目が水面より上で jump を押したときに跳ねる速さ（ブロック/秒） */
    surfaceJumpSpeed: 4.2,
    /** 液体の中で壁に当たりながら jump を押したときに登る速さ（ブロック/秒） */
    climbSpeed: 4.6,
    /** 足が最後に液体に触れていた高さから、壁を登り続けられる高さ（ブロック） */
    climbHeight: 1.3,
  },
  /**
   * @param {import('../entity.js').Entity} e
   * @param {any} p
   * @param {{dt: number, world: any, registry: any}} ctx
   */
  update(e, p, ctx) {
    if (e.flying) {
      e.inLiquid = false;
      return;
    }
    const getBlock = (x, y, z) => ctx.world.getBlock(x, y, z);
    const [x, y, z] = e.pos;
    const liquid = ctx.registry.liquid;
    e.inLiquid = liquidAt(getBlock, liquid, x, y + p.lowerBodyHeight, z) !== 0;
    e.eyeInLiquid = liquidAt(getBlock, liquid, x, y + e.eyeHeight, z) !== 0;

    // 壁登りの上限: 足が液体に触れている間は更新し、地面に立ったら解除する
    if (liquidAt(getBlock, liquid, x, y + 0.01, z) !== 0) e.state.climbLimit = y + p.climbHeight;
    else if (e.onGround) e.state.climbLimit = -Infinity;
    const canClimb = e.hitWall && e.control.jump && y < (e.state.climbLimit ?? -Infinity);

    if (!e.inLiquid) {
      if (canClimb) e.vel[1] = Math.max(e.vel[1], p.climbSpeed);
      return;
    }

    e.moveScale *= p.moveScale;
    e.vel[1] *= Math.exp(-p.drag * ctx.dt);
    e.acc[1] -= p.gravity;
    e.terminalVelocity = p.maxSinkSpeed;

    if (canClimb) {
      e.vel[1] = Math.max(e.vel[1], p.climbSpeed);
    } else if (e.control.jump) {
      if (!e.eyeInLiquid) {
        e.vel[1] = Math.max(e.vel[1], p.surfaceJumpSpeed);
      } else {
        // 水中では一定の速さで浮上する（重力の分も打ち消す）
        e.vel[1] = Math.max(e.vel[1], p.swimUpSpeed);
        e.acc[1] = 0;
      }
    }
  },
};
