/**
 * エントリーポイント。データを読み込み、シーンを作ってゲームループを回す。
 */
import * as THREE from 'three';
import { loadRegistry } from './core/dataLoader.js';
import { buildTextureAtlas } from './render/atlas.js';
import { CHUNK_SIZE } from './core/constants.js';
import { Chunk, chunkKey, toChunkCoord, toLocalCoord } from './world/chunk.js';
import { createTerrainGenerator } from './world/terrain.js';
import { buildChunkMeshData } from './render/mesher.js';
import { ChunkRenderer, createBlockMaterials } from './render/chunkRenderer.js';

/**
 * WebGL レンダラーを作り、コンテナに追加する。
 * @param {HTMLElement} container
 * @returns {THREE.WebGLRenderer}
 */
function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * ゲームを起動する。
 */
async function main() {
  const container = document.getElementById('app');
  const registry = await loadRegistry();

  const renderer = createRenderer(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.05, 1000);

  const atlas = await buildTextureAtlas(registry);
  const chunkRenderer = new ChunkRenderer(scene, createBlockMaterials(atlas.texture));
  // 仮表示: 周囲のチャンクを生成して描画する（World ができたら置き換える）
  const terrain = createTerrainGenerator(1, registry.defs.worldgen, registry);
  const chunks = new Map();
  const R = 3;
  for (let cx = -R; cx <= R; cx++) {
    for (let cz = -R; cz <= R; cz++) {
      const c = new Chunk(cx, cz);
      terrain.generate(c);
      chunks.set(chunkKey(cx, cz), c);
    }
  }
  for (const c of chunks.values()) {
    const data = buildChunkMeshData(c, registry, atlas.tileUVs, (x, y, z) => {
      const wx = c.cx * CHUNK_SIZE + x, wz = c.cz * CHUNK_SIZE + z;
      const n = chunks.get(chunkKey(toChunkCoord(wx), toChunkCoord(wz)));
      return n ? n.get(toLocalCoord(wx), y, toLocalCoord(wz)) : 0;
    });
    chunkRenderer.setChunkMesh(chunkKey(c.cx, c.cz), c.cx, c.cz, data);
  }
  camera.position.set(-40, 110, -40);
  camera.lookAt(10, 60, 10);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  /** フレームごとの描画 */
  function frame() {
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__game = { registry, scene, camera, renderer, chunkRenderer };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f66;padding:8px">${err.message}</pre>`);
});
