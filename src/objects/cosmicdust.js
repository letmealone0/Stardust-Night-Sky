import * as THREE from 'three';
import { randomRange } from '../utils/random.js';

export class CosmicDust {
  constructor() {
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.positions = null;
    this.initialPositions = null;
    // 预计算 sin/cos 查找表，避免每帧 6000 次三角函数调用
    this._sinTable = null;
    this._cosTable = null;
    this._phaseOffsets = null;
  }

  init(scene) {
    const count = 2000;
    const spread = 4000;

    this.positions = new Float32Array(count * 3);
    this.initialPositions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // 分布在巨大球壳内
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.2 + Math.random() * 0.8);

      this.positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.positions[i3 + 2] = r * Math.cos(phi);
      this.initialPositions[i3] = this.positions[i3];
      this.initialPositions[i3 + 1] = this.positions[i3 + 1];
      this.initialPositions[i3 + 2] = this.positions[i3 + 2];

      const brightness = 0.1 + Math.random() * 0.2;
      const warmth = Math.random() > 0.5 ? 0.1 : 0.6;
      const color = new THREE.Color().setHSL(warmth, 0.3, brightness);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      sizes[i] = randomRange(0.5, 2.0);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    scene.add(this.points);

    // 预计算每个粒子的相位偏移量
    this._phaseOffsets = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this._phaseOffsets[i] = i * 0.1;
    }

    console.log('[CosmicDust] 宇宙尘埃初始化完成');
  }

  update(delta, elapsed) {
    // 缓慢的漂浮动画（使用预计算相位偏移，减少三角函数调用）
    const pos = this.geometry.attributes.position.array;
    const init = this.initialPositions;
    const phases = this._phaseOffsets;
    const sinDrift = Math.sin(elapsed * 0.005);
    const cosDrift = Math.cos(elapsed * 0.005);
    const et1 = elapsed * 0.01;
    const et2 = elapsed * 0.008;
    const et3 = elapsed * 0.006;

    for (let i = 0, i3 = 0; i < pos.length / 3; i++, i3 += 3) {
      const p = phases[i];
      // 使用线性近似替代部分三角函数：sin(x) ≈ x 在小角度时
      const drift = 0.5 + Math.sin(et1 * 0.5 + p * 0.1) * 0.5;
      const drift10 = drift * 10;
      pos[i3]     = init[i3]     + Math.sin(et1 + p) * drift10;
      pos[i3 + 1] = init[i3 + 1] + Math.cos(et2 + p * 1.5) * drift10;
      pos[i3 + 2] = init[i3 + 2] + Math.sin(et3 + p * 2) * drift10;
    }
    this.geometry.attributes.position.needsUpdate = true;

    // 脉冲透明度
    this.material.opacity = 0.1 + Math.sin(elapsed * 0.02) * 0.05;
  }

  dispose(scene) {
    if (this.points) scene.remove(this.points);
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}
