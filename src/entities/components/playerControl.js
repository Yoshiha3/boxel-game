/**
 * playerControl: キーボードとマウスの入力を、エンティティの操作入力と向きに反映する。
 */
export default {
  name: 'playerControl',
  order: 0,
  defaults: {},
  /**
   * @param {import('../entity.js').Entity} e
   * @param {any} p
   * @param {{input?: {control: import('../entity.js').Control, yaw: number, pitch: number}}} ctx
   */
  update(e, p, ctx) {
    if (!ctx.input) return;
    Object.assign(e.control, ctx.input.control);
    e.yaw = ctx.input.yaw;
    e.pitch = ctx.input.pitch;
  },
};
