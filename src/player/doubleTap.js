/**
 * キーの2回押し（ダブルタップ）の検出（純粋なロジック）。
 */
export class DoubleTapDetector {
  /**
   * @param {number} windowMs 2回目の押下を受け付ける時間（ミリ秒）
   */
  constructor(windowMs = 300) {
    this.windowMs = windowMs;
    /** 直前の押下時刻（未押下なら -Infinity） */
    this.lastPress = -Infinity;
  }

  /**
   * キーが押されたことを伝える。直前の押下から windowMs 以内ならダブルタップとして true を返す。
   * 検出したら状態を戻すので、3回連続で押しても2回目だけが true になる。
   * @param {number} timeMs 押下時刻（ミリ秒）
   * @returns {boolean}
   */
  press(timeMs) {
    if (timeMs - this.lastPress <= this.windowMs) {
      this.lastPress = -Infinity;
      return true;
    }
    this.lastPress = timeMs;
    return false;
  }
}
