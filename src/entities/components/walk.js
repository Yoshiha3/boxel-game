/**
 * walk: 操作入力（control）に従って地面を歩く・走る・ジャンプする。
 * 速度は目標速度へ指数的に近づける（ティックレートに依存しない）。
 */
export default {
  name: 'walk',
  order: 30,
  defaults: {
    /** 歩く速さ（ブロック/秒） */
    speed: 4.3,
    /** 走る速さ（ブロック/秒） */
    sprintSpeed: 5.6,
    /** ジャンプの初速（ブロック/秒） */
    jumpSpeed: 8.4,
    /** 地上での加速の強さ（1/秒。大きいほど素早く目標速度になる） */
    groundAccel: 20,
    /** 空中での加速の強さ（1/秒） */
    airAccel: 4,
  },
  /**
   * @param {import('../entity.js').Entity} e
   * @param {any} p
   * @param {{dt: number}} ctx
   */
  update(e, p, ctx) {
    if (e.flying) return;
    const c = e.control;
    const speed = (c.sprint ? p.sprintSpeed : p.speed) * e.moveScale;
    const [tx, tz] = moveDirection(e.yaw, c.forward, c.strafe);
    const accel = e.onGround || e.inLiquid ? p.groundAccel : p.airAccel;
    const k = 1 - Math.exp(-accel * ctx.dt);
    e.vel[0] += (tx * speed - e.vel[0]) * k;
    e.vel[2] += (tz * speed - e.vel[2]) * k;
    if (c.jump && e.onGround && !e.inLiquid) e.vel[1] = p.jumpSpeed;
  },
};

/**
 * 向きと前後・左右の入力から、水平の移動方向（長さ 1 以下）を求める。
 * @param {number} yaw ラジアン（0 で -Z を向く）
 * @param {number} forward 前 +1 / 後ろ -1
 * @param {number} strafe 右 +1 / 左 -1
 * @returns {[number, number]} [x, z]
 */
export function moveDirection(yaw, forward, strafe) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  let x = -sin * forward + cos * strafe;
  let z = -cos * forward - sin * strafe;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return [x, z];
}
