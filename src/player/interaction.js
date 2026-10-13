/**
 * 視線の先のブロックの選択枠表示と、マウスによる破壊・設置（ブラウザ専用）。
 */
import * as THREE from 'three';
import { raycast } from './raycast.js';
import { REACH, breakBlock, isTargetable, placeBlock } from './blockActions.js';

export class BlockInteraction {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../world/world.js').World} world
   * @param {import('../entities/entityManager.js').EntityManager} entities
   */
  constructor(scene, world, entities) {
    this.world = world;
    this.entities = entities;
    /** @type {{block: number[], normal: number[], distance: number} | null} 視線の先のブロック */
    this.target = null;
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
    );
    box.dispose();
    this.outline.visible = false;
    scene.add(this.outline);
    this.isTarget = (x, y, z) => isTargetable(world.registry, world.getBlock(x, y, z));
  }

  /**
   * カメラの位置と向きから視線の先のブロックを求め、選択枠を動かす（毎フレーム）。
   * @param {THREE.Camera} camera
   */
  update(camera) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const o = camera.position;
    this.target = raycast(this.isTarget, [o.x, o.y, o.z], [dir.x, dir.y, dir.z], REACH);
    this.outline.visible = this.target !== null;
    if (this.target) {
      const [x, y, z] = this.target.block;
      this.outline.position.set(x + 0.5, y + 0.5, z + 0.5);
    }
  }

  /**
   * 視線の先のブロックを壊す。
   * @returns {boolean}
   */
  breakTarget() {
    return this.target ? breakBlock(this.world, this.target.block) : false;
  }

  /**
   * 視線の先のブロックの面の隣に、ブロックを置く。
   * @param {number} id 置くブロック
   * @returns {boolean}
   */
  placeAtTarget(id) {
    if (!this.target) return false;
    const [x, y, z] = this.target.block;
    const [nx, ny, nz] = this.target.normal;
    const others = this.entities.entities.filter((e) => e.has('collision'));
    return placeBlock(this.world, [x + nx, y + ny, z + nz], id, others);
  }
}
