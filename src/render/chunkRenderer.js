/**
 * チャンクのメッシュデータから three.js のメッシュを作り、シーンに出し入れする。
 */
import * as THREE from 'three';
import { CHUNK_SIZE } from '../core/constants.js';

/**
 * ブロック描画用のマテリアルを作る（描画の種類ごと）。
 * 明るさは頂点カラーで付けるので、ライトを使わない MeshBasicMaterial にする。
 * @param {THREE.Texture} atlasTexture
 * @returns {{opaque: THREE.Material, cutout: THREE.Material, liquid: THREE.Material}}
 */
export function createBlockMaterials(atlasTexture) {
  return {
    opaque: new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true }),
    cutout: new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true, alphaTest: 0.5 }),
    liquid: new THREE.MeshBasicMaterial({
      map: atlasTexture, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
    }),
  };
}

/**
 * メッシュデータ1レイヤー分から BufferGeometry を作る。
 * @param {{positions: Float32Array, normals: Float32Array, uvs: Float32Array, colors: Float32Array, indices: Uint32Array}} data
 * @returns {THREE.BufferGeometry}
 */
function createGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * チャンクごとのメッシュを管理する。
 */
export class ChunkRenderer {
  /**
   * @param {THREE.Scene} scene
   * @param {ReturnType<typeof createBlockMaterials>} materials
   */
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    /** @type {Map<string, THREE.Group>} チャンクキー → メッシュのグループ */
    this.groups = new Map();
  }

  /**
   * チャンクのメッシュを作る（既にあれば差し替える）。
   * @param {string} key チャンクキー
   * @param {number} cx
   * @param {number} cz
   * @param {ReturnType<import('./mesher.js').buildChunkMeshData>} meshData
   */
  setChunkMesh(key, cx, cz, meshData) {
    this.removeChunk(key);
    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    for (const layer of /** @type {const} */ (['opaque', 'cutout', 'liquid'])) {
      const data = meshData[layer];
      if (data.faceCount === 0) continue;
      const mesh = new THREE.Mesh(createGeometry(data), this.materials[layer]);
      // 半透明の液体は不透明なものの後に描く
      if (layer === 'liquid') mesh.renderOrder = 1;
      group.add(mesh);
    }
    this.scene.add(group);
    this.groups.set(key, group);
  }

  /**
   * チャンクのメッシュを取り除き、GPU のリソースを解放する。
   * @param {string} key
   */
  removeChunk(key) {
    const group = this.groups.get(key);
    if (!group) return;
    for (const mesh of group.children) mesh.geometry.dispose();
    this.scene.remove(group);
    this.groups.delete(key);
  }
}
