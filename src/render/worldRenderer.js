/**
 * World と ChunkRenderer をつなぎ、毎フレームのチャンク読み込み・メッシュ化・破棄を行う。
 */
import { CHUNK_SIZE } from '../core/constants.js';
import { chunkKey, toChunkCoord } from '../world/chunk.js';
import { buildChunkMeshData } from './mesher.js';

export class WorldRenderer {
  /**
   * @param {import('../world/world.js').World} world
   * @param {import('./chunkRenderer.js').ChunkRenderer} chunkRenderer
   * @param {Float32Array} tileUVs
   */
  constructor(world, chunkRenderer, tileUVs) {
    this.world = world;
    this.chunkRenderer = chunkRenderer;
    this.tileUVs = tileUVs;
    /** 1フレームで生成するチャンク数の上限 */
    this.maxLoadsPerFrame = 2;
    /** 1フレームでメッシュ化するチャンク数の上限 */
    this.maxMeshesPerFrame = 2;
  }

  /**
   * 1フレーム分の更新を行う。
   * @param {number} x 視点のワールド座標
   * @param {number} z
   * @param {number} renderDistance 描画距離（チャンク数）
   */
  update(x, z, renderDistance) {
    const cx = toChunkCoord(Math.floor(x));
    const cz = toChunkCoord(Math.floor(z));
    const { unloaded } = this.world.update(cx, cz, renderDistance, this.maxLoadsPerFrame);
    for (const key of unloaded) this.chunkRenderer.removeChunk(key);

    // 描画距離の外に出たメッシュは外す（戻ってきたら作り直す）
    const r2 = renderDistance * renderDistance;
    for (const key of [...this.chunkRenderer.groups.keys()]) {
      const g = this.chunkRenderer.groups.get(key);
      const gcx = g.position.x / CHUNK_SIZE, gcz = g.position.z / CHUNK_SIZE;
      if ((gcx - cx) ** 2 + (gcz - cz) ** 2 > r2) {
        this.chunkRenderer.removeChunk(key);
        if (this.world.chunks.has(key)) this.world.dirty.add(key);
      }
    }

    for (const chunk of this.world.takeChunksToMesh(cx, cz, renderDistance, this.maxMeshesPerFrame)) {
      const data = buildChunkMeshData(chunk, this.world.registry, this.tileUVs, this.world.neighborLookup(chunk));
      this.chunkRenderer.setChunkMesh(chunkKey(chunk.cx, chunk.cz), chunk.cx, chunk.cz, data);
    }
  }
}
