/**
 * エントリーポイント。データを読み込み、シーンを作ってゲームループを回す。
 */
import * as THREE from 'three';
import { loadRegistry } from './core/dataLoader.js';
import { buildTextureAtlas } from './render/atlas.js';
import { FACE_COUNT } from './core/constants.js';

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
 * ブロック1個分のプレビュー用ジオメトリを作る（BoxGeometry の面順は FACE と同じ）。
 * @param {import('./core/registry.js').Registry} registry
 * @param {Float32Array} tileUVs
 * @param {number} id 数値ID
 * @returns {THREE.BoxGeometry}
 */
function createBlockPreviewGeometry(registry, tileUVs, id) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uv = geo.attributes.uv;
  for (let face = 0; face < FACE_COUNT; face++) {
    const t = registry.faceTile[id * FACE_COUNT + face] * 4;
    for (let i = face * 4; i < face * 4 + 4; i++) {
      uv.setXY(i, tileUVs[t] + uv.getX(i) * (tileUVs[t + 2] - tileUVs[t]),
        tileUVs[t + 1] + uv.getY(i) * (tileUVs[t + 3] - tileUVs[t + 1]));
    }
  }
  return geo;
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
  camera.position.set(2, 2, 3);
  camera.lookAt(0.5, 0.5, 0.5);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
  const atlas = await buildTextureAtlas(registry);
  const material = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5, transparent: true });
  // 仮表示: 全ブロックを1列に並べる（チャンクのメッシュ生成ができたら置き換える）
  for (let id = 1; id < registry.blockIds.length; id++) {
    const cube = new THREE.Mesh(createBlockPreviewGeometry(registry, atlas.tileUVs, id), material);
    cube.position.set((id - 1) * 1.5 - registry.blockIds.length * 0.75, 0.5, 0);
    scene.add(cube);
  }
  camera.position.set(0, 4, 10);
  camera.lookAt(0, 0, 0);

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

  window.__game = { registry, scene, camera, renderer };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f66;padding:8px">${err.message}</pre>`);
});
