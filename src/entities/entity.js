/**
 * エンティティ（プレイヤー・動物など、ブロック以外で動くもの）。
 * 振る舞いは、定義の components に書かれたコンポーネントの組み合わせで決まる。
 */

/**
 * エンティティを操作する入力（プレイヤーはキーボード、動物は AI が書き込む）。
 * toggleFlight は1回だけ有効な指示で、flight コンポーネントが消費する。
 * @typedef {{forward: number, strafe: number, jump: boolean, descend: boolean, sprint: boolean, toggleFlight?: boolean}} Control
 */

/**
 * 空の操作入力を作る。
 * @returns {Control}
 */
export function emptyControl() {
  return { forward: 0, strafe: 0, jump: false, descend: false, sprint: false, toggleFlight: false };
}

export class Entity {
  /**
   * @param {number} id 実行時の通し番号
   * @param {any} def エンティティ定義（JSON）
   * @param {number[]} pos 足元の中心 [x, y, z]
   * @param {Object<string, any>} components コンポーネント名 → 既定値を補ったパラメータ
   */
  constructor(id, def, pos, components) {
    this.id = id;
    /** 定義の文字列ID */
    this.type = def.id;
    this.def = def;
    /** 足元の中心 */
    this.pos = [...pos];
    /** 直前のティックの位置（描画の補間用） */
    this.prevPos = [...pos];
    /** 速度（ブロック/秒） */
    this.vel = [0, 0, 0];
    /** このティックの加速度（ブロック/秒²。毎ティック 0 に戻す） */
    this.acc = [0, 0, 0];
    /** 当たり判定の大きさ [幅X, 高さ, 幅Z] */
    this.size = def.size;
    /** 目の高さ（足元から） */
    this.eyeHeight = def.eyeHeight ?? def.size[1] * 0.9;
    /** 向き（ラジアン。0 で -Z 方向を向く） */
    this.yaw = 0;
    this.pitch = 0;
    /** @type {Control} */
    this.control = emptyControl();
    this.onGround = false;
    /** 水平方向で壁に当たったか（直前のティック） */
    this.hitWall = false;
    /** 移動速度の倍率（水中などで下がる。毎ティック 1 に戻す） */
    this.moveScale = 1;
    /** 落下の終端速度（ブロック/秒）。gravity などが設定する */
    this.terminalVelocity = Infinity;
    /** 飛行中か */
    this.flying = false;
    /** 体が液体に触れているか */
    this.inLiquid = false;
    /** 目が液体の中にあるか */
    this.eyeInLiquid = false;
    /** コンポーネントのパラメータ */
    this.components = components;
    /** コンポーネントごとの内部状態 */
    this.state = {};
  }

  /**
   * コンポーネントを持っているか。
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return name in this.components;
  }

  /**
   * 描画用に、前のティックと現在の位置を補間した位置を返す。
   * @param {number} alpha 0〜1
   * @returns {number[]}
   */
  interpolatedPos(alpha) {
    return this.pos.map((p, i) => this.prevPos[i] + (p - this.prevPos[i]) * alpha);
  }
}
