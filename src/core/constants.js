/**
 * ゲーム全体で共有する定数。
 */

/** チャンクの一辺のブロック数（X・Z 方向） */
export const CHUNK_SIZE = 16;

/** ワールドの高さ（Y 方向のブロック数） */
export const WORLD_HEIGHT = 128;

/** 1チャンクあたりのブロック数 */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
