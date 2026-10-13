/**
 * マージ済みの定義セットを検証し、実行時に使うレジストリを作る。
 *
 * - ブロックの文字列IDに数値IDを振る（0 は空気で予約）
 * - 実行時に高速に引けるテーブル（solid / opaque / liquid / renderType / faceTile）を作る
 * - 参照の整合性（存在しないブロックID・コンポーネント名など）を検証する
 */
import { AIR, FACE_COUNT, MAX_BLOCK_TYPES } from './constants.js';
import { worldgenBlockRefs } from '../world/terrain.js';
import { validateEntityDef } from '../entities/components/index.js';
import { validateSettings } from '../ui/settings.js';

/** 描画の種類の番号 */
export const RENDER = Object.freeze({ NONE: 0, CUBE: 1, CUTOUT: 2, LIQUID: 3 });

const RENDER_BY_NAME = { cube: RENDER.CUBE, cutout: RENDER.CUTOUT, liquid: RENDER.LIQUID };

/**
 * ブロック定義に既定値を補った「正規化済みの定義」を返す。
 * @param {any} def ブロック定義（JSON）
 * @returns {{id: string, name: string, render: string, solid: boolean, opaque: boolean, liquid: boolean, breakable: boolean, cullSameType: boolean, textures: any}}
 */
export function normalizeBlock(def) {
  const render = def.render ?? 'cube';
  const liquid = render === 'liquid';
  return {
    ...def,
    name: def.name ?? def.id,
    render,
    liquid,
    solid: def.solid ?? !liquid,
    opaque: def.opaque ?? render === 'cube',
    breakable: def.breakable ?? true,
    cullSameType: def.cullSameType ?? true,
  };
}

/**
 * ブロックの面ごとのテクスチャパスを返す（FACE の番号順）。
 * `all` を基本にし、`side` / `top` / `bottom` や面ごとの指定で上書きする。
 * @param {any} textures ブロック定義の textures
 * @returns {(string|undefined)[]}
 */
export function faceTexturePaths(textures = {}) {
  const side = textures.side ?? textures.all;
  return [
    textures.east ?? side,
    textures.west ?? side,
    textures.top ?? textures.all,
    textures.bottom ?? textures.all,
    textures.south ?? side,
    textures.north ?? side,
  ];
}

/**
 * ブロック定義を検証する。問題があれば errors に追加する。
 * @param {Object<string, any>} blocks
 * @param {string[]} errors
 */
function validateBlocks(blocks, errors) {
  const ids = Object.keys(blocks);
  if (ids.includes('air')) errors.push('block "air" is reserved');
  if (ids.length + 1 > MAX_BLOCK_TYPES) errors.push(`too many block types (max ${MAX_BLOCK_TYPES - 1})`);
  for (const id of ids) {
    const b = blocks[id];
    if (b.render !== undefined && !(b.render in RENDER_BY_NAME)) {
      errors.push(`block "${id}": unknown render "${b.render}"`);
    }
    const paths = faceTexturePaths(b.textures);
    paths.forEach((p, face) => {
      if (typeof p !== 'string') errors.push(`block "${id}": missing texture for face ${face}`);
    });
  }
}

/**
 * ホットバー定義を検証する。
 * @param {any} hotbar
 * @param {Object<string, any>} blocks
 * @param {string[]} errors
 */
function validateHotbar(hotbar, blocks, errors) {
  for (const id of hotbar?.slots ?? []) {
    if (!(id in blocks)) errors.push(`hotbar: unknown block "${id}"`);
  }
}

/**
 * 地形生成の定義を検証する。
 * @param {any} worldgen
 * @param {Object<string, any>} blocks
 * @param {string[]} errors
 */
function validateWorldgen(worldgen, blocks, errors) {
  if (!worldgen || Object.keys(worldgen).length === 0) return;
  if (typeof worldgen.seaLevel !== 'number') errors.push('worldgen: "seaLevel" must be a number');
  for (const [where, id] of worldgenBlockRefs(worldgen)) {
    if (!(id in blocks)) errors.push(`worldgen.${where}: unknown block "${id}"`);
  }
}

/**
 * 定義セットからレジストリを作る。問題があればまとめて例外を投げる。
 * @param {ReturnType<import('./packLoader.js').emptyDefinitions>} defs
 * @returns {Registry}
 */
export function buildRegistry(defs) {
  /** @type {string[]} */
  const errors = [];
  validateBlocks(defs.blocks, errors);
  validateHotbar(defs.hotbar, defs.blocks, errors);
  validateWorldgen(defs.worldgen, defs.blocks, errors);
  for (const def of Object.values(defs.entities)) validateEntityDef(def, errors);
  validateSettings(defs.settings, errors);
  if (errors.length) throw new Error(`Invalid data:\n- ${errors.join('\n- ')}`);
  return new Registry(defs);
}

/**
 * 実行時に参照するレジストリ。
 */
export class Registry {
  /**
   * @param {ReturnType<import('./packLoader.js').emptyDefinitions>} defs 検証済みの定義セット
   */
  constructor(defs) {
    /** 元の定義セット */
    this.defs = defs;
    /** @type {string[]} 数値ID → 文字列ID */
    this.blockIds = ['air'];
    /** @type {any[]} 数値ID → 正規化済みブロック定義（0 は空気） */
    this.blocks = [normalizeBlock({ id: 'air', render: 'none', solid: false, opaque: false, breakable: false })];
    /** @type {Map<string, number>} 文字列ID → 数値ID */
    this.blockIndex = new Map([['air', AIR]]);

    // ID の割り当て順を安定させるため、文字列IDでソートする
    for (const id of Object.keys(defs.blocks).sort()) {
      this.blockIndex.set(id, this.blockIds.length);
      this.blockIds.push(id);
      this.blocks.push(normalizeBlock(defs.blocks[id]));
    }

    const n = MAX_BLOCK_TYPES;
    /** @type {Uint8Array} 当たり判定があるか */
    this.solid = new Uint8Array(n);
    /** @type {Uint8Array} 光を通さず、隣接面を隠すか */
    this.opaque = new Uint8Array(n);
    /** @type {Uint8Array} 液体か */
    this.liquid = new Uint8Array(n);
    /** @type {Uint8Array} 同じ種類同士の面を隠すか */
    this.cullSameType = new Uint8Array(n);
    /** @type {Uint8Array} 描画の種類（RENDER） */
    this.renderType = new Uint8Array(n);
    /** @type {string[]} テクスチャのパス一覧（タイル番号順） */
    this.textures = [];
    /** @type {Uint16Array} (数値ID * 6 + 面) → タイル番号 */
    this.faceTile = new Uint16Array(n * FACE_COUNT);

    /** @type {Map<string, number>} */
    const tileIndex = new Map();
    this.blocks.forEach((b, id) => {
      this.solid[id] = b.solid ? 1 : 0;
      this.opaque[id] = b.opaque ? 1 : 0;
      this.liquid[id] = b.liquid ? 1 : 0;
      this.cullSameType[id] = b.cullSameType ? 1 : 0;
      this.renderType[id] = RENDER_BY_NAME[b.render] ?? RENDER.NONE;
      if (id === AIR) return;
      faceTexturePaths(b.textures).forEach((path, face) => {
        if (!tileIndex.has(path)) {
          tileIndex.set(path, this.textures.length);
          this.textures.push(path);
        }
        this.faceTile[id * FACE_COUNT + face] = tileIndex.get(path);
      });
    });
  }

  /**
   * 文字列IDから数値IDを得る。
   * @param {string} id
   * @returns {number}
   */
  blockId(id) {
    const n = this.blockIndex.get(id);
    if (n === undefined) throw new Error(`unknown block "${id}"`);
    return n;
  }

  /**
   * エンティティ定義を得る。
   * @param {string} id
   * @returns {any}
   */
  entity(id) {
    const def = this.defs.entities[id];
    if (!def) throw new Error(`unknown entity "${id}"`);
    return def;
  }

  /**
   * 数値IDからブロック定義を得る。
   * @param {number} id
   */
  block(id) {
    return this.blocks[id];
  }
}
