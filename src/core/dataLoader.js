/**
 * ブラウザでデータパックを読み込み、レジストリを作る。
 */
import { loadPacks } from './packLoader.js';
import { buildRegistry } from './registry.js';

/**
 * fetch で JSON を読む。
 * @param {string} path サイトルートからの相対パス
 * @returns {Promise<any>}
 */
export async function fetchJson(path) {
  // データを編集したときに古いキャッシュを使わないよう、毎回サーバーに確認する（変更がなければ 304）
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`);
  return res.json();
}

/**
 * data/packs.json に書かれたパックを読み込み、レジストリを作る。
 * @returns {Promise<import('./registry.js').Registry>}
 */
export async function loadRegistry() {
  const packNames = await fetchJson('data/packs.json');
  const defs = await loadPacks(fetchJson, packNames);
  return buildRegistry(defs);
}
