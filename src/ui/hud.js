/**
 * HUD（クロスヘア、ホットバー、デバッグ表示）（ブラウザ専用）。
 */
import { FACE, FACE_COUNT } from '../core/constants.js';
import { atlasGrid } from '../render/atlasLayout.js';
import { TILE_SIZE } from '../render/atlas.js';

export class Hud {
  /**
   * @param {import('../core/registry.js').Registry} registry
   * @param {HTMLCanvasElement} atlasCanvas アトラスの画像
   * @param {number[]} slots ホットバーのブロック（数値ID）
   */
  constructor(registry, atlasCanvas, slots) {
    this.registry = registry;
    this.slots = slots;
    this.selected = 0;
    this.root = document.getElementById('hud');
    this.hotbar = document.getElementById('hotbar');
    this.debug = document.getElementById('debug');
    this.slotElements = slots.map((id) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.title = registry.block(id).name;
      slot.append(blockIcon(registry, atlasCanvas, id));
      this.hotbar.append(slot);
      return slot;
    });
    this.select(0);
  }

  /**
   * ホットバーのスロットを選ぶ。
   * @param {number} index 範囲外は折り返す
   */
  select(index) {
    const n = this.slots.length;
    this.selected = ((index % n) + n) % n;
    this.slotElements.forEach((el, i) => el.classList.toggle('selected', i === this.selected));
  }

  /** 選択中のブロック（数値ID） */
  get selectedBlock() {
    return this.slots[this.selected];
  }

  /**
   * HUD の表示・非表示（メニュー表示中は隠す）。
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.root.hidden = !visible;
  }

  /**
   * デバッグ表示の切り替え。
   */
  toggleDebug() {
    this.debug.hidden = !this.debug.hidden;
  }

  /**
   * デバッグ表示の内容を更新する（表示中のみ）。
   * @param {string[]} lines
   */
  setDebugLines(lines) {
    if (!this.debug.hidden) this.debug.textContent = lines.join('\n');
  }
}

/**
 * ブロックのアイコン（側面のテクスチャ）を canvas で作る。
 * @param {import('../core/registry.js').Registry} registry
 * @param {HTMLCanvasElement} atlasCanvas
 * @param {number} id
 * @returns {HTMLCanvasElement}
 */
function blockIcon(registry, atlasCanvas, id) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  const tile = registry.faceTile[id * FACE_COUNT + FACE.PZ];
  const { cols } = atlasGrid(registry.textures.length);
  ctx.drawImage(atlasCanvas, (tile % cols) * TILE_SIZE, Math.floor(tile / cols) * TILE_SIZE, TILE_SIZE, TILE_SIZE,
    0, 0, TILE_SIZE, TILE_SIZE);
  return canvas;
}
