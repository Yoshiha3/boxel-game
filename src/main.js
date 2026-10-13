/**
 * エントリーポイント。データを読み込み、シーンを作ってゲームループを回す。
 */
import * as THREE from 'three';
import { loadRegistry } from './core/dataLoader.js';
import { buildTextureAtlas } from './render/atlas.js';
import { CHUNK_SIZE } from './core/constants.js';
import { createTerrainGenerator } from './world/terrain.js';
import { World } from './world/world.js';
import { ChunkRenderer, createBlockMaterials } from './render/chunkRenderer.js';
import { WorldRenderer } from './render/worldRenderer.js';

/** シードの既定値（URL の ?seed= で上書きできる） */
const DEFAULT_SEED = 20260101;

/**
 * URL パラメータからシードを読む。数値でなければ文字列をハッシュしてシードにする。
 * @returns {number}
 */
function readSeed() {
  const v = new URLSearchParams(location.search).get('seed');
  if (v === null || v === '') return DEFAULT_SEED;
  if (/^-?\d+$/.test(v)) return Number(v) >>> 0;
  let h = 2166136261;
  for (const c of v) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

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
  const seed = readSeed();
  const terrain = createTerrainGenerator(seed, registry.defs.worldgen, registry);
  const world = new World(registry, terrain);
  const worldRenderer = new WorldRenderer(world, chunkRenderer, atlas.tileUVs);
  let renderDistance = 6;
  /** 描画距離に合わせてフォグを設定する（チャンクの端を隠す） */
  const updateFog = () => {
    const far = renderDistance * CHUNK_SIZE;
    scene.fog = new THREE.Fog(scene.background, far * 0.6, far);
  };
  updateFog();

  // 仮の視点（プレイヤーができたら置き換える）
  camera.position.set(0.5, terrain.heightAt(0, 0) + 20, 0.5);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(-0.35, Math.PI * 0.75, 0);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  /** フレームごとの描画 */
  function frame() {
    worldRenderer.update(camera.position.x, camera.position.z, renderDistance);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__game = {
    registry, scene, camera, renderer, world, worldRenderer, seed,
    /** 視点を移動する */
    teleport(x, y, z) { camera.position.set(x, y, z); },
    /** 描画距離を変更する */
    setRenderDistance(d) { renderDistance = d; updateFog(); },
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f66;padding:8px">${err.message}</pre>`);
});
