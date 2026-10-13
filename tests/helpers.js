/**
 * テスト用の共通ヘルパー。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** リポジトリのルートディレクトリ */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** テスト用パックの置き場所 */
const FIXTURE_PACKS = 'tests/fixtures/packs';

/**
 * サイトルートからの相対パスで JSON を読む関数（loadPacks に渡す）。
 * "data/packs/test-<name>/..." は tests/fixtures/packs/<name>/... に読み替える。
 * @param {string} p
 * @returns {Promise<any>}
 */
export async function readJson(p) {
  const mapped = p.replace(/^data\/packs\/test-/, `${FIXTURE_PACKS}/`);
  return JSON.parse(await readFile(path.join(ROOT, mapped), 'utf8'));
}

/**
 * data/packs.json に書かれたパックを読み込んだ定義セットを返す。
 * @returns {Promise<any>}
 */
export async function loadDefaultDefs() {
  const { loadPacks } = await import('../src/core/packLoader.js');
  return loadPacks(readJson, await readJson('data/packs.json'));
}
