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
import { findSpawn } from './world/spawn.js';
import { EntityManager } from './entities/entityManager.js';
import { TickClock } from './core/tickClock.js';
import { Input } from './player/input.js';
import { Settings } from './ui/settings.js';
import { Menu } from './ui/menu.js';

/** マウス感度 1.0 のときの回転量（ラジアン/ピクセル） */
const BASE_SENSITIVITY = 0.0025;

/**
 * localStorage を返す（使えない環境では null）。
 * @returns {Storage | null}
 */
function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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

  const entities = new EntityManager(world, registry);
  const player = entities.spawn('player', findSpawn(terrain));
  const input = new Input(renderer.domElement);
  const clock = new TickClock(20);
  camera.rotation.order = 'YXZ';

  const settings = new Settings(registry.defs.settings, safeLocalStorage());
  settings.subscribe((key, value) => applySetting(key, value));
  /**
   * 設定値をゲームに反映する。
   * @param {string} key
   * @param {any} value
   */
  function applySetting(key, value) {
    if (key === 'renderDistance') {
      renderDistance = value;
      updateFog();
    } else if (key === 'fov') {
      camera.fov = value;
      camera.updateProjectionMatrix();
    } else if (key === 'mouseSensitivity') {
      input.sensitivity = BASE_SENSITIVITY * value;
    } else if (key === 'tickRate') {
      clock.setTickRate(value);
    }
  }

  // メニュー: 起動時は表示しておき、ボタンを押したときだけポインターロックに入る
  const menu = new Menu(settings, () => {
    input.requestLock().catch(() => menu.setMessage('ブラウザに拒否されました。もう一度押してください'));
  });
  menu.setReady('開始');
  input.lockListeners.push((locked) => {
    if (locked) {
      menu.hide();
    } else {
      menu.setReady('ゲームに戻る');
      menu.show();
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  let lastTime = performance.now();
  /**
   * フレームごとの処理: ティックを進め、カメラを補間した位置に置いて描画する。
   * @param {number} now
   */
  function frame(now) {
    const elapsed = (now - lastTime) / 1000;
    lastTime = now;
    // メニュー表示中はゲームを止める（チャンクの読み込みと描画は続ける）
    const ticks = menu.visible ? 0 : clock.advance(elapsed);
    for (let i = 0; i < ticks; i++) {
      entities.update(clock.dt, { control: input.getControl(), yaw: input.yaw, pitch: input.pitch });
    }
    const [px, py, pz] = player.interpolatedPos(clock.alpha);
    camera.position.set(px, py + player.eyeHeight, pz);
    camera.rotation.set(input.pitch, input.yaw, 0);
    worldRenderer.update(px, pz, renderDistance);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__game = {
    registry, scene, camera, renderer, world, worldRenderer, seed, entities, player, input, clock,
    /** プレイヤーを移動する */
    teleport(x, y, z) { player.pos = [x, y, z]; player.prevPos = [x, y, z]; player.vel = [0, 0, 0]; },
    /** 描画距離を変更する */
    setRenderDistance(d) { settings.set('renderDistance', d); },
    settings, menu,
    /** ポインターロックの状態を再現する（自動テスト用。実際のロックは行わない） */
    simulateLock(locked) { input.setLocked(locked); },
    /** 設定を変更する */
    setSetting(key, value) { return settings.set(key, value); },
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f66;padding:8px">${err.message}</pre>`);
});
