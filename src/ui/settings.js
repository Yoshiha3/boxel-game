/**
 * 設定値の管理。設定項目の定義（settings.json）から既定値を作り、変更を検証して保存する。
 * DOM には依存しない（保存先は引数で受け取る）。
 */

/** 保存に使うキー */
export const STORAGE_KEY = 'boxel-game.settings';

/** 設定項目の種類 */
export const SETTING_TYPES = ['range', 'select', 'toggle'];

/**
 * 設定項目の定義を検証する。
 * @param {any} settings settings.json の内容
 * @param {string[]} errors
 */
export function validateSettings(settings, errors) {
  for (const [key, item] of Object.entries(settings?.items ?? {})) {
    const where = `settings.items.${key}`;
    if (!SETTING_TYPES.includes(item.type)) {
      errors.push(`${where}: unknown type "${item.type}"`);
      continue;
    }
    if (item.type === 'range') {
      if (![item.min, item.max, item.step, item.default].every((n) => typeof n === 'number')) {
        errors.push(`${where}: range needs numeric min, max, step and default`);
      } else if (item.default < item.min || item.default > item.max) {
        errors.push(`${where}: default is out of range`);
      }
    } else if (item.type === 'select') {
      if (!Array.isArray(item.options) || !item.options.includes(item.default)) {
        errors.push(`${where}: select needs "options" that include the default`);
      }
    } else if (typeof item.default !== 'boolean') {
      errors.push(`${where}: toggle default must be boolean`);
    }
  }
}

/**
 * 設定項目を表示順（order）に並べて返す。
 * @param {any} settings
 * @returns {[string, any][]}
 */
export function orderedSettingItems(settings) {
  return Object.entries(settings?.items ?? {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
}

/**
 * 値を設定項目の定義に合うように直す。直せなければ既定値を返す。
 * @param {any} item 設定項目の定義
 * @param {unknown} value
 * @returns {any}
 */
export function coerceSetting(item, value) {
  switch (item.type) {
    case 'range': {
      const n = Number(value);
      if (!Number.isFinite(n)) return item.default;
      const stepped = item.min + Math.round((n - item.min) / item.step) * item.step;
      // 刻みの計算で出る小数の誤差を丸める
      const rounded = Number(stepped.toFixed(6));
      return Math.min(item.max, Math.max(item.min, rounded));
    }
    case 'select': {
      const found = item.options.find((o) => String(o) === String(value));
      return found === undefined ? item.default : found;
    }
    case 'toggle':
      return typeof value === 'boolean' ? value : item.default;
    default:
      return item.default;
  }
}

/**
 * 設定値。
 */
export class Settings {
  /**
   * @param {any} definitions settings.json の内容
   * @param {{getItem: (k: string) => string | null, setItem: (k: string, v: string) => void} | null} storage 保存先（localStorage など）
   */
  constructor(definitions, storage) {
    this.items = Object.fromEntries(orderedSettingItems(definitions));
    this.storage = storage;
    /** @type {Object<string, any>} */
    this.values = Object.fromEntries(Object.entries(this.items).map(([k, item]) => [k, item.default]));
    /** @type {((key: string, value: any) => void)[]} */
    this.listeners = [];
    this.load();
  }

  /**
   * 保存されている値を読み込む（壊れていたら無視する）。
   */
  load() {
    let saved = {};
    try {
      saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '{}') ?? {};
    } catch {
      saved = {};
    }
    for (const [k, v] of Object.entries(saved)) {
      if (k in this.items) this.values[k] = coerceSetting(this.items[k], v);
    }
  }

  /**
   * 現在の値を保存する。
   */
  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // 保存できない環境（プライベートモードなど）では保存しない
    }
  }

  /**
   * 値を取得する。
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return this.values[key];
  }

  /**
   * 値を設定し、保存して変更を通知する。
   * @param {string} key
   * @param {unknown} value
   * @returns {any} 実際に設定された値
   */
  set(key, value) {
    const item = this.items[key];
    if (!item) throw new Error(`unknown setting "${key}"`);
    const v = coerceSetting(item, value);
    this.values[key] = v;
    this.save();
    for (const fn of this.listeners) fn(key, v);
    return v;
  }

  /**
   * 変更を監視する。登録時に現在の全ての値でも1回ずつ呼ぶ（初期値の反映のため）。
   * @param {(key: string, value: any) => void} fn
   */
  subscribe(fn) {
    this.listeners.push(fn);
    for (const [k, v] of Object.entries(this.values)) fn(k, v);
  }
}
