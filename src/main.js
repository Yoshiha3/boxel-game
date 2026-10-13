/**
 * エントリーポイント。データを読み込み、シーンを作ってゲームループを回す。
 */
import * as THREE from 'three';
import { loadRegistry } from './core/dataLoader.js';

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
  camera.position.set(2, 2, 3);
  camera.lookAt(0.5, 0.5, 0.5);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x55aa44 }));
  cube.position.set(0.5, 0.5, 0.5);
  scene.add(cube);

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
