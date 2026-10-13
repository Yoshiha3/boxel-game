/**
 * flight: 飛行。control.toggleFlight で切り替える（プレイヤーは Space の2回押し）。
 * 飛行中は重力を受けず、jump で上昇、descend で下降する。地面に着いた状態で下降すると飛行をやめる。
 */
import { moveDirection } from './walk.js';

export default {
  name: 'flight',
  order: 20,
  defaults: {
    /** 水平の速さ（ブロック/秒） */
    speed: 10.9,
    /** 走るときの水平の速さ（ブロック/秒） */
    sprintSpeed: 21.6,
    /** 上昇・下降の速さ（ブロック/秒） */
    verticalSpeed: 7.5,
    /** 目標速度への近づきやすさ（1/秒） */
    accel: 10,
  },
  /**
   * @param {import('../entity.js').Entity} e
   * @param {any} p
   * @param {{dt: number}} ctx
   */
  update(e, p, ctx) {
    const c = e.control;
    if (c.toggleFlight) {
      e.flying = !e.flying;
      c.toggleFlight = false;
    }
    if (!e.flying) return;
    if (e.onGround && c.descend) {
      e.flying = false;
      return;
    }
    const k = 1 - Math.exp(-p.accel * ctx.dt);
    const speed = c.sprint ? p.sprintSpeed : p.speed;
    const [tx, tz] = moveDirection(e.yaw, c.forward, c.strafe);
    const ty = ((c.jump ? 1 : 0) - (c.descend ? 1 : 0)) * p.verticalSpeed;
    e.vel[0] += (tx * speed - e.vel[0]) * k;
    e.vel[1] += (ty - e.vel[1]) * k;
    e.vel[2] += (tz * speed - e.vel[2]) * k;
  },
};
