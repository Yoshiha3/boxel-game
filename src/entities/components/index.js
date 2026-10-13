/**
 * コンポーネントの一覧と、エンティティ定義の検証。
 *
 * コンポーネントは { name, order, defaults, update?(entity, params, ctx) } の形。
 * order の小さい順に毎ティック実行する。defaults はパラメータの既定値で、
 * データ側のパラメータはこれとマージされる（未知のキーや型の違いは検証エラー）。
 */
import playerControl from './playerControl.js';
import walk from './walk.js';
import gravity from './gravity.js';
import collision from './collision.js';
import flight from './flight.js';

/** @type {Object<string, {name: string, order: number, defaults: Object<string, any>, update?: Function}>} */
export const COMPONENTS = Object.fromEntries(
  [playerControl, walk, gravity, collision, flight].map((c) => [c.name, c]),
);

/**
 * 値の型の名前（配列は "array"）。
 * @param {unknown} v
 * @returns {string}
 */
function typeName(v) {
  return Array.isArray(v) ? 'array' : typeof v;
}

/**
 * エンティティ定義を検証する。
 * @param {any} def
 * @param {string[]} errors
 */
export function validateEntityDef(def, errors) {
  const where = `entity "${def.id}"`;
  if (!Array.isArray(def.size) || def.size.length !== 3 || !def.size.every((n) => typeof n === 'number' && n > 0)) {
    errors.push(`${where}: "size" must be [width, height, depth] with positive numbers`);
  }
  for (const [name, params] of Object.entries(def.components ?? {})) {
    const comp = COMPONENTS[name];
    if (!comp) {
      errors.push(`${where}: unknown component "${name}"`);
      continue;
    }
    for (const [key, value] of Object.entries(params ?? {})) {
      if (!(key in comp.defaults)) errors.push(`${where}: component "${name}" has unknown parameter "${key}"`);
      else if (typeName(value) !== typeName(comp.defaults[key])) {
        errors.push(`${where}: ${name}.${key} must be ${typeName(comp.defaults[key])}`);
      }
    }
  }
}

/**
 * エンティティ定義のコンポーネントに既定値を補う。
 * @param {any} def
 * @returns {Object<string, any>}
 */
export function resolveComponents(def) {
  const out = {};
  for (const [name, params] of Object.entries(def.components ?? {})) {
    out[name] = { ...COMPONENTS[name].defaults, ...params };
  }
  return out;
}

/**
 * 実行順に並べたコンポーネント名の配列を返す。
 * @param {Object<string, any>} components
 * @returns {string[]}
 */
export function orderedComponentNames(components) {
  return Object.keys(components).sort((a, b) => COMPONENTS[a].order - COMPONENTS[b].order);
}
