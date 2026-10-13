/**
 * gravity: 下向きの加速度を加える。飛行中は無効。
 */
export default {
  name: 'gravity',
  order: 40,
  defaults: {
    /** 重力加速度（ブロック/秒²） */
    acceleration: 28,
    /** 落下の終端速度（ブロック/秒） */
    terminalVelocity: 60,
  },
  /**
   * @param {import('../entity.js').Entity} e
   * @param {any} p
   */
  update(e, p) {
    if (e.flying) return;
    // 液体の中の重力は waterPhysics が扱う
    if (e.inLiquid && e.has('waterPhysics')) return;
    e.acc[1] -= p.acceleration;
    e.terminalVelocity = p.terminalVelocity;
  },
};
