/**
 * 構造物ジェネレータの一覧と、構造物定義・配置ルールの検証。
 *
 * ジェネレータは { type, defaults, validate, extent, build } の形。
 * 構造物の定義（structures/*.json）は type でジェネレータを選び、残りの項目は defaults とマージされる。
 */
import tree from './tree.js';
import template from './template.js';

/** @type {Object<string, any>} type → ジェネレータ */
export const STRUCTURE_TYPES = Object.fromEntries([tree, template].map((t) => [t.type, t]));

/** 定義の項目のうち、パラメータでないもの */
const META_KEYS = ['id', 'name', 'type'];

/**
 * 値の型の名前（配列は "array"）。
 * @param {unknown} v
 * @returns {string}
 */
function typeName(v) {
  return Array.isArray(v) ? 'array' : typeof v;
}

/**
 * 構造物の定義にジェネレータの既定値を補う。
 * @param {any} def
 * @returns {any}
 */
export function resolveStructure(def) {
  return { ...STRUCTURE_TYPES[def.type].defaults, ...def };
}

/**
 * 構造物の定義を検証する。
 * @param {any} def
 * @param {(id: string) => boolean} hasBlock
 * @param {string[]} errors
 */
export function validateStructureDef(def, hasBlock, errors) {
  const gen = STRUCTURE_TYPES[def.type];
  if (!gen) {
    errors.push(`structure "${def.id}": unknown type "${def.type}"`);
    return;
  }
  for (const [key, value] of Object.entries(def)) {
    if (META_KEYS.includes(key)) continue;
    if (!(key in gen.defaults)) errors.push(`structure "${def.id}": unknown parameter "${key}"`);
    else if (typeName(value) !== typeName(gen.defaults[key])) {
      errors.push(`structure "${def.id}": "${key}" must be ${typeName(gen.defaults[key])}`);
    }
  }
  gen.validate(resolveStructure(def), hasBlock, errors);
}

/**
 * worldgen.structures（配置ルール）を検証する。
 * @param {any[]} rules
 * @param {Object<string, any>} structures 構造物の定義
 * @param {(id: string) => boolean} hasBlock
 * @param {string[]} errors
 */
export function validatePlacementRules(rules, structures, hasBlock, errors) {
  if (rules === undefined) return;
  if (!Array.isArray(rules)) {
    errors.push('worldgen.structures must be an array');
    return;
  }
  rules.forEach((rule, i) => {
    const where = `worldgen.structures[${i}]`;
    if (!(rule.structure in structures)) errors.push(`${where}: unknown structure "${rule.structure}"`);
    if (!Number.isInteger(rule.attemptsPerChunk) || rule.attemptsPerChunk < 0) {
      errors.push(`${where}: "attemptsPerChunk" must be a non-negative integer`);
    }
    if (typeof rule.chance !== 'number' || rule.chance < 0 || rule.chance > 1) errors.push(`${where}: "chance" must be 0..1`);
    for (const id of rule.groundBlocks ?? []) {
      if (!hasBlock(id)) errors.push(`${where}: unknown block "${id}" in groundBlocks`);
    }
    if (rule.density) {
      const { frequency, min, max } = rule.density;
      if (![frequency, min, max].every((n) => typeof n === 'number')) {
        errors.push(`${where}: "density" needs numeric frequency, min and max`);
      }
    }
  });
}
