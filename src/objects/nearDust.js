/**
 * 近处微尘层
 * 悬浮在相机前方的小光点/灰尘粒子，作为尺度参照物
 * 移动时从镜前快速掠过 → 强化速度感 + "远处星球必然巨大"的感知
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class NearDust {
  constructor() {
    this.points = null;
    this.camera = null;
    this.positions = [];
    this._tmpPos = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
  }

  init(camera) {
    this.camera = camera;
    const cfg = config.nearDust || {};
    const count = cfg.count || 200;
    const range = cfg.range || 40;
    const size = cfg.size || 0.15;
    const opacity = cfg.opacity || 0.25;

    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // 在相机前方的锥形区域散开
      const z = 5 + Math.random() * (range - 5); // 5~range 单位
      const spreadAngle = 0.6; // 约 35° 锥形
      const theta = Math.random() * Math.PI * 2;
      const r = Math.random() * z * Math.tan(spreadAngle);

      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * z * Math.tan(spreadAngle) * 2;
      positions[i * 3 + 2] = -z;

      this.positions.push({
        baseX: positions[i * 3],
        baseY: positions[i * 3 + 1],
        baseZ: positions[i * 3 + 2],
        phase: Math.random() * Math.PI * 2,
        speed: 0.1 + Math.random() * 0.5,
      });

      sizes[i] = size * (0.5 + Math.random());
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color: 0x8899bb,
      size: 0.25,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.camera.add(this.points); // 挂相机子节点，跟随相机

    this.geometry = geometry;
    this.count = count;
    this.range = range;

    console.log('[NearDust] 初始化完成，数量:', count);
  }

  update(delta, velocity) {
    if (!this.points || !this.camera) return;

    const speed = velocity ? velocity.length() : 0;
    const positions = this.geometry.attributes.position.array;
    const cfg = config.nearDust || {};
    const drift = cfg.driftSpeed || 0.3;

    // 获取相机前方方向
    this._camDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    for (let i = 0; i < this.count; i++) {
      const p = this.positions[i];
      const idx = i * 3;

      // 微小漂移 + 呼吸运动
      const breath = Math.sin(Date.now() * 0.001 * p.speed + p.phase) * 0.5;

      positions[idx] = p.baseX + breath * 0.2;
      positions[idx + 1] = p.baseY + breath * 0.3;
      positions[idx + 2] = p.baseZ;

      // 速度越快，粒子越亮
      if (speed > 0.5) {
        positions[idx] += (Math.random() - 0.5) * speed * 0.01 * delta;
        positions[idx + 1] += (Math.random() - 0.5) * speed * 0.01 * delta;
      }

      // 超出范围重置
      if (positions[idx + 2] > -3 || positions[idx + 2] < -this.range) {
        positions[idx + 2] = -(5 + Math.random() * (this.range - 5));
        positions[idx] = (Math.random() - 0.5) * 15;
        positions[idx + 1] = (Math.random() - 0.5) * 10;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;

    // 速度越快，粒子越亮越密
    if (this.points.material.opacity !== undefined) {
      const targetOpacity = Math.min(0.5, cfg.opacity + speed * 0.01);
      this.points.material.opacity += (targetOpacity - this.points.material.opacity) * 0.1;
    }
  }

  dispose() {
    if (this.points && this.camera) {
      this.camera.remove(this.points);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.points?.material) this.points.material.dispose();
    this.points = null;
  }
}
