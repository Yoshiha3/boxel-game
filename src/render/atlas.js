/**
 * レジストリのテクスチャ（PNG）を読み込み、1枚のアトラスにまとめる（ブラウザ専用）。
 */
import * as THREE from 'three';
import { atlasGrid, buildTileUVs } from './atlasLayout.js';

/** タイル1枚のピクセル数 */
export const TILE_SIZE = 16;

/**
 * 画像を読み込む。
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load texture ${src}`));
    img.src = src;
  });
}

/**
 * レジストリの textures をタイル番号順に並べたアトラスを作る。
 * @param {import('../core/registry.js').Registry} registry
 * @returns {Promise<{texture: THREE.CanvasTexture, tileUVs: Float32Array, canvas: HTMLCanvasElement}>}
 */
export async function buildTextureAtlas(registry) {
  const paths = registry.textures;
  const images = await Promise.all(paths.map(loadImage));
  const { cols, rows } = atlasGrid(paths.length);
  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE_SIZE;
  canvas.height = rows * TILE_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  images.forEach((img, t) => {
    ctx.drawImage(img, (t % cols) * TILE_SIZE, Math.floor(t / cols) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, tileUVs: buildTileUVs(paths.length), canvas };
}
