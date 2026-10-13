/**
 * エンティティの生成・更新・削除を行う。
 * 毎ティック、各エンティティのコンポーネントを order 順に実行し、その後で移動（衝突解決）を行う。
 */
import { Entity } from './entity.js';
import { COMPONENTS, orderedComponentNames, resolveComponents } from './components/index.js';
import { moveWithCollision } from '../physics/aabb.js';
import { toChunkCoord } from '../world/chunk.js';

export class EntityManager {
  /**
   * @param {import('../world/world.js').World} world
   * @param {import('../core/registry.js').Registry} registry
   */
  constructor(world, registry) {
    this.world = world;
    this.registry = registry;
    /** @type {Entity[]} */
    this.entities = [];
    this.nextId = 1;
    /** 整数座標のブロックが固体か */
    this.isSolid = (x, y, z) => registry.solid[world.getBlock(x, y, z)] === 1;
  }

  /**
   * エンティティを生成する。
   * @param {string} typeId エンティティ定義の文字列ID
   * @param {number[]} pos 足元の中心
   * @returns {Entity}
   */
  spawn(typeId, pos) {
    const def = this.registry.entity(typeId);
    const components = resolveComponents(def);
    const e = new Entity(this.nextId++, def, pos, components);
    /** 実行順に並べたコンポーネント名 */
    e.order = orderedComponentNames(components);
    this.entities.push(e);
    return e;
  }

  /**
   * エンティティを取り除く。
   * @param {Entity} e
   */
  remove(e) {
    this.entities = this.entities.filter((x) => x !== e);
  }

  /**
   * 1ティック分の更新を行う。
   * @param {number} dt ティックの長さ（秒）
   * @param {any} [input] プレイヤーの入力（playerControl が読む）
   */
  update(dt, input) {
    const ctx = { dt, input, world: this.world, registry: this.registry, isSolid: this.isSolid };
    for (const e of this.entities) {
      e.prevPos = [...e.pos];
      // 足元のチャンクが読み込まれていなければ止めておく（落下して埋まるのを防ぐ）
      if (!this.world.getChunk(toChunkCoord(Math.floor(e.pos[0])), toChunkCoord(Math.floor(e.pos[2])))) continue;
      this.updateEntity(e, ctx);
    }
  }

  /**
   * エンティティ1体のコンポーネントを実行し、移動させる。
   * @param {Entity} e
   * @param {any} ctx
   */
  updateEntity(e, ctx) {
    e.acc = [0, 0, 0];
    e.moveScale = 1;
    e.terminalVelocity = Infinity;
    for (const name of e.order) COMPONENTS[name].update?.(e, e.components[name], ctx);
    integrate(e, ctx.dt, e.has('collision') ? ctx.isSolid : null);
  }
}

/**
 * 速度と加速度から位置を進める。一定加速度の厳密解（x += v·dt + a·dt²/2）を使うので、
 * ティックレートを変えても軌道がほぼ変わらない。
 * @param {Entity} e
 * @param {number} dt
 * @param {((x: number, y: number, z: number) => boolean) | null} isSolid null なら当たり判定なし
 */
export function integrate(e, dt, isSolid) {
  const delta = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    delta[i] = e.vel[i] * dt + 0.5 * e.acc[i] * dt * dt;
    e.vel[i] += e.acc[i] * dt;
  }
  if (e.vel[1] < -e.terminalVelocity) e.vel[1] = -e.terminalVelocity;
  if (delta[1] < -e.terminalVelocity * dt) delta[1] = -e.terminalVelocity * dt;

  if (!isSolid) {
    for (let i = 0; i < 3; i++) e.pos[i] += delta[i];
    e.onGround = false;
    e.hitWall = false;
    return;
  }
  const { hit, onGround } = moveWithCollision(isSolid, e.pos, e.size, delta);
  for (let i = 0; i < 3; i++) if (hit[i]) e.vel[i] = 0;
  e.onGround = onGround;
  e.hitWall = hit[0] || hit[2];
}
