/**
 * ゲーム全体で共有する定数。
 */

/** チャンクの一辺のブロック数（X・Z 方向） */
export const CHUNK_SIZE = 16;

/** ワールドの高さ（Y 方向のブロック数） */
export const WORLD_HEIGHT = 128;

/** 1チャンクあたりのブロック数 */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

/**
 * 面の番号。メッシュ生成やテクスチャの面指定で共通に使う。
 * 0:+X(東) 1:-X(西) 2:+Y(上) 3:-Y(下) 4:+Z(南) 5:-Z(北)
 */
export const FACE = Object.freeze({ PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 });

/** 面の数 */
export const FACE_COUNT = 6;

/** 各面の法線ベクトル（FACE の番号順） */
export const FACE_NORMALS = Object.freeze([
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
]);

/** 空気ブロックの数値ID（常に 0。データでは定義しない） */
export const AIR = 0;

/** ブロックIDの最大種類数（チャンクは Uint8Array で持つ） */
export const MAX_BLOCK_TYPES = 256;
