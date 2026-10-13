/**
 * データパックの読み込みと、深いマージによる上書き。
 *
 * パックは `data/packs/<name>/pack.json` で、含まれる定義ファイルを列挙する。
 * 複数のパックを順に読み、同じ id の定義は後のパックで深くマージして上書きする。
 * DOM や fetch には依存せず、JSON を読む関数を引数で受け取る。
 */

/** id をキーに持つ定義の種類（ファイルの配列で列挙する） */
export const COLLECTION_KINDS = ['blocks', 'entities', 'structures'];

/** パック全体で1つの設定（ファイル1つ。深くマージする） */
export const SINGLETON_KINDS = ['worldgen', 'hotbar', 'settings'];

/**
 * プレーンなオブジェクトかどうかを判定する。
 * @param {unknown} v
 * @returns {boolean}
 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * base に override を深くマージした新しい値を返す（引数は変更しない）。
 * オブジェクト同士は再帰的にマージし、配列やプリミティブは override で置き換える。
 * @param {any} base
 * @param {any} override
 * @returns {any}
 */
export function deepMerge(base, override) {
  if (override === undefined) return structuredClone(base);
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in out ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out;
}

/**
 * 定義の中の「.png で終わる文字列」を、パックのディレクトリからの相対パスとして解決する。
 * これにより、各パックは自分のディレクトリ内の画像を相対パスで参照できる。
 * @param {any} value 定義（再帰的に処理する）
 * @param {string} packDir 例: "data/packs/base"
 * @returns {any}
 */
export function resolveAssetPaths(value, packDir) {
  if (typeof value === 'string') {
    return value.endsWith('.png') && !value.includes('://') && !value.startsWith('/')
      ? `${packDir}/${value}`
      : value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveAssetPaths(v, packDir));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveAssetPaths(v, packDir);
    return out;
  }
  return value;
}

/**
 * 空の定義セットを作る。
 * @returns {{blocks: Object<string, any>, entities: Object<string, any>, structures: Object<string, any>, worldgen: any, hotbar: any, settings: any, packs: string[]}}
 */
export function emptyDefinitions() {
  return { blocks: {}, entities: {}, structures: {}, worldgen: {}, hotbar: {}, settings: {}, packs: [] };
}

/**
 * パック1つ分のデータを、既存の定義セットにマージする。
 * @param {ReturnType<typeof emptyDefinitions>} defs マージ先（変更される）
 * @param {{kind: string, data: any}[]} files パックから読んだファイル（resolveAssetPaths 済み）
 * @param {string} packName エラー表示用のパック名
 */
export function mergePackInto(defs, files, packName) {
  for (const { kind, data, path } of files) {
    if (COLLECTION_KINDS.includes(kind)) {
      if (!isPlainObject(data) || typeof data.id !== 'string') {
        throw new Error(`[${packName}] ${path}: definition must be an object with string "id"`);
      }
      const prev = defs[kind][data.id];
      defs[kind][data.id] = prev ? deepMerge(prev, data) : structuredClone(data);
    } else if (SINGLETON_KINDS.includes(kind)) {
      defs[kind] = deepMerge(defs[kind], data);
    }
  }
  defs.packs.push(packName);
}

/**
 * パックを順に読み込んで、マージ済みの定義セットを返す。
 * @param {(path: string) => Promise<any>} readJson サイトルートからの相対パスを受け取り JSON を返す関数
 * @param {string[]} packNames 読み込むパック名（後ほど優先）
 * @param {string} [dataRoot] パックのあるディレクトリ
 * @returns {Promise<ReturnType<typeof emptyDefinitions>>}
 */
export async function loadPacks(readJson, packNames, dataRoot = 'data/packs') {
  const defs = emptyDefinitions();
  for (const name of packNames) {
    const packDir = `${dataRoot}/${name}`;
    const manifest = await readJson(`${packDir}/pack.json`);
    /** @type {{kind: string, path: string}[]} */
    const entries = [];
    for (const kind of COLLECTION_KINDS) {
      for (const p of manifest[kind] ?? []) entries.push({ kind, path: p });
    }
    for (const kind of SINGLETON_KINDS) {
      if (manifest[kind]) entries.push({ kind, path: manifest[kind] });
    }
    const files = await Promise.all(entries.map(async ({ kind, path }) => ({
      kind,
      path,
      data: resolveAssetPaths(await readJson(`${packDir}/${path}`), packDir),
    })));
    mergePackInto(defs, files, name);
  }
  return defs;
}
