/**
 * キーボードとマウスの入力（ブラウザ専用）。
 * ポインターロック中のマウス移動で視点を回し、押されているキーから操作入力を作る。
 */

/** キー割り当て（KeyboardEvent.code） */
export const KEYMAP = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  descend: ['ShiftLeft', 'ShiftRight'],
  sprint: ['ControlLeft', 'ControlRight'],
};

/** 上下の視点の限界（真上・真下の少し手前） */
const PITCH_LIMIT = Math.PI / 2 - 0.001;

export class Input {
  /**
   * @param {HTMLElement} element ポインターロックの対象（canvas）
   */
  constructor(element) {
    this.element = element;
    /** @type {Set<string>} 押されているキー */
    this.keys = new Set();
    /** 視点の向き（ラジアン） */
    this.yaw = 0;
    this.pitch = 0;
    /** マウス感度（ラジアン/ピクセル） */
    this.sensitivity = 0.0025;
    /** ポインターロック中か */
    this.locked = false;
    /** @type {((code: string, e: KeyboardEvent) => void)[]} キーが押されたとき（リピートを除く）に呼ぶ関数 */
    this.keyDownListeners = [];
    /** @type {((locked: boolean) => void)[]} ロック状態が変わったときに呼ぶ関数 */
    this.lockListeners = [];
    /** @type {((button: number) => void)[]} ロック中にマウスボタンが押されたときに呼ぶ関数 */
    this.mouseDownListeners = [];
    /** @type {((delta: number) => void)[]} ロック中にホイールを回したときに呼ぶ関数 */
    this.wheelListeners = [];

    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        for (const fn of this.keyDownListeners) fn(e.code, e);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - e.movementY * this.sensitivity));
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      for (const fn of this.mouseDownListeners) fn(e.button);
    });
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      for (const fn of this.wheelListeners) fn(Math.sign(e.deltaY));
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      for (const fn of this.lockListeners) fn(this.locked);
    });
  }

  /**
   * ポインターロックを要求する。ユーザー操作（クリック）の中から呼ぶ必要がある。
   * @returns {Promise<void>} ブラウザが拒否したら reject される
   */
  async requestLock() {
    await this.element.requestPointerLock();
  }

  /**
   * いずれかのキーが押されているか。
   * @param {string[]} codes
   * @returns {boolean}
   */
  anyPressed(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /**
   * 押されているキーから操作入力を作る。
   * @returns {import('../entities/entity.js').Control}
   */
  getControl() {
    const k = (name) => this.anyPressed(KEYMAP[name]);
    return {
      forward: (k('forward') ? 1 : 0) - (k('back') ? 1 : 0),
      strafe: (k('right') ? 1 : 0) - (k('left') ? 1 : 0),
      jump: k('jump'),
      descend: k('descend'),
      sprint: k('sprint'),
    };
  }
}
