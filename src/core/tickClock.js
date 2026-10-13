/**
 * 固定ステップの「ティック」を管理する時計（純粋なロジック）。
 * 描画のフレーム時間を受け取り、実行すべきティック数と、補間の割合を求める。
 */
export class TickClock {
  /**
   * @param {number} tickRate 1秒あたりのティック数
   * @param {number} [maxTicksPerFrame] 1フレームで処理するティック数の上限（処理が追いつかないときの暴走防止）
   */
  constructor(tickRate, maxTicksPerFrame = 10) {
    this.maxTicksPerFrame = maxTicksPerFrame;
    /** まだティックとして消化していない時間（秒） */
    this.accumulator = 0;
    this.setTickRate(tickRate);
  }

  /**
   * ティックレートを変更する。
   * @param {number} tickRate
   */
  setTickRate(tickRate) {
    this.tickRate = tickRate;
    /** 1ティックの長さ（秒） */
    this.dt = 1 / tickRate;
    this.accumulator = Math.min(this.accumulator, this.dt);
  }

  /**
   * 経過時間を加え、このフレームで実行すべきティック数を返す。
   * 上限を超えた分の時間は捨てる。
   * @param {number} elapsed 前のフレームからの経過時間（秒）
   * @returns {number}
   */
  advance(elapsed) {
    this.accumulator += Math.max(0, elapsed);
    // 浮動小数点の誤差で 1 ティック分に僅かに届かないことがあるので、小さな余裕を持たせる
    let ticks = Math.floor(this.accumulator / this.dt + 1e-9);
    if (ticks > this.maxTicksPerFrame) {
      ticks = this.maxTicksPerFrame;
      this.accumulator = this.dt * ticks;
    }
    this.accumulator = Math.max(0, this.accumulator - ticks * this.dt);
    return ticks;
  }

  /**
   * 直前のティックから次のティックまでの進み具合（0〜1）。描画の補間に使う。
   * @returns {number}
   */
  get alpha() {
    return Math.min(1, this.accumulator / this.dt);
  }
}
