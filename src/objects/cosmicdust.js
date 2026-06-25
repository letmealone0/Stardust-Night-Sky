import * as THREE from 'three';
import { randomRange } from '../utils/random.js';

export class CosmicDust {
  constructor() {
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.positions = null;
    this.initialPositions = null;
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

    console.log('[CosmicDust] 宇宙尘埃初始化完成');
  }

  update(delta, elapsed) {
    // 缓慢的漂浮动画
    const pos = this.geometry.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i++) {
      const i3 = i * 3;
      const drift = 0.5 + Math.sin(elapsed * 0.005 + i * 0.01) * 0.5;
      pos[i3] = this.initialPositions[i3] + Math.sin(elapsed * 0.01 + i * 0.1) * 10 * drift;
      pos[i3 + 1] = this.initialPositions[i3 + 1] + Math.cos(elapsed * 0.008 + i * 0.15) * 10 * drift;
      pos[i3 + 2] = this.initialPositions[i3 + 2] + Math.sin(elapsed * 0.006 + i * 0.2) * 10 * drift;
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
