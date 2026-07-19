/**
 * 行星碎石环系统
 * 仅用于气态巨行星，粒子数与行星半径成比例
 * 宽环带 + 稀疏分布，符合天文事实
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

class PlanetRing {
  constructor(planetGroup, planetRadius, dataOverrides = {}) {
    const cfg = config.planetRings;
    if (!cfg?.enabled) return;

    const typeCfg = cfg.gas;
    if (!typeCfg?.enabled) return;

    this.group = new THREE.Group();
    this.meshes = [];
    this.orbitData = [];
    this.planetRadius = planetRadius;
    this.planetGroup = planetGroup;
    this._dummy = new THREE.Object3D(); // v29-fix: 复用，避免每帧 new

    // 粒子数与行星半径成比例：大行星 → 更多粒子
    const referenceRadius = 50;
    const baseCount = dataOverrides.baseCount ?? typeCfg.baseCount ?? 180;
    const count = Math.max(40, Math.round(baseCount * (planetRadius / referenceRadius)));

    const innerR = planetRadius * (dataOverrides.innerScale ?? typeCfg.innerScale ?? 1.6);
    const outerR = planetRadius * (dataOverrides.outerScale ?? typeCfg.outerScale ?? 3.5);

    this._createBelt(innerR, outerR, count, typeCfg, dataOverrides);
    planetGroup.add(this.group);
  }

  _createBelt(innerR, outerR, count, typeCfg, overrides) {
    const minS = overrides.minSize ?? typeCfg.minSize ?? 0.8;
    const maxS = overrides.maxSize ?? typeCfg.maxSize ?? 8;
    const thicknessFrac = typeCfg.thickness ?? 0.6;
    const colorHex = overrides.color ?? typeCfg.color ?? '#8a8070';
    const orbitBase = config.planetRings?.orbitSpeedBase ?? 0.25;

    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const bandRange = outerR - innerR;

    for (let i = 0; i < count; i++) {
      // 环形角度
      const angle = Math.random() * Math.PI * 2;
      // 半径：均匀分布，避免内外密度不均
      const radius = innerR + Math.random() * bandRange;
      // 垂直散布：正比于行星半径 × 厚度系数
      const height = (Math.random() - 0.5) * this.planetRadius * thicknessFrac * 2;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // 碎石尺寸分布：小碎石多，大岩石少
      const t = Math.random();
      const scale = minS + (maxS - minS) * Math.pow(t, 1.5);

      dummy.position.set(x, height, z);
      dummy.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Kepler 差速：内圈快、外圈慢
      const keplerSpeed = orbitBase / Math.sqrt(Math.max(radius / this.planetRadius, 0.1));
      this.orbitData.push({
        angle,
        radius,
        height,
        speed: keplerSpeed + (Math.random() - 0.5) * keplerSpeed * 0.2,
        scale,
      });
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  update(delta) {
    if (this.meshes.length === 0) return;

    const iData = this.orbitData;
    const dummy = this._dummy;  // v29-fix: 复用成员变量，避免每帧 GC

    let idx = 0;
    for (const mesh of this.meshes) {
      for (let i = 0; i < mesh.count && idx < iData.length; i++, idx++) {
        const d = iData[idx];
        d.angle += d.speed * delta;

        const x = Math.cos(d.angle) * d.radius;
        const z = Math.sin(d.angle) * d.radius;
        dummy.position.set(x, d.height, z);

        dummy.rotation.set(
          (dummy.rotation.x || 0) + (i * 0.003) * delta,
          (dummy.rotation.y || 0) + (i * 0.005) * delta,
          0
        );
        dummy.scale.setScalar(d.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.group.remove(mesh);
    }
    this.meshes = [];
    this.orbitData = [];
  }
}

/**
 * 管理所有行星的碎石环
 */
export class PlanetRingSystem {
  constructor() {
    this.rings = [];
  }

  /**
   * 为行星添加碎石环（仅气态类型）
   * @param {THREE.Group} planetGroup
   * @param {number} planetRadius
   * @param {object} overrides 可选覆盖
   */
  addRing(planetGroup, planetRadius, overrides = {}) {
    if (!config.planetRings?.enabled) return null;
    const ring = new PlanetRing(planetGroup, planetRadius, overrides);
    if (ring.meshes.length > 0) {
      this.rings.push(ring);
    }
    return ring;
  }

  update(delta) {
    for (const ring of this.rings) ring.update(delta);
  }

  dispose() {
    for (const ring of this.rings) ring.dispose();
    this.rings = [];
  }
}
