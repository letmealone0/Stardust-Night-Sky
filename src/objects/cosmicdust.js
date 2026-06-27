import * as THREE from 'three';
import { randomRange } from '../utils/random.js';
import { config } from '../core/config.js';

export class CosmicDust {
  constructor() {
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.positions = null;
    this.initialPositions = null;
    this.camera = null;
    this._centerPos = new THREE.Vector3(); // 当前粒子系统中心
    this._phaseOffsets = null;
  }

  setCamera(camera) {
    this.camera = camera;
    if (camera) this._centerPos.copy(camera.position);
  }

  init(scene) {
    const { count, spread } = config.cosmicDust;

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

  update(delta, elapsed, velocity) {
    const { recenterDistance, spread } = config.cosmicDust;

    // 当相机远离中心时，重新居中粒子系统
    if (this.camera) {
      const dist = this.camera.position.distanceTo(this._centerPos);
      if (dist > recenterDistance) {
        this.recenterParticles(spread);
      }
    }

    // 计算移动速度（用于粒子推开效果）
    let speed = 0;
    let vx = 0, vy = 0, vz = 0;
    if (velocity && velocity.lengthSq() > 0.01) {
      speed = velocity.length();
      const len = speed;
      vx = velocity.x / len;
      vy = velocity.y / len;
      vz = velocity.z / len;
    }
    const speedFactor = Math.min(speed / 50, 1.0);

    // 缓慢的漂浮动画（使用预计算相位偏移，减少三角函数调用）
    const pos = this.geometry.attributes.position.array;
    const init = this.initialPositions;
    const phases = this._phaseOffsets;
    const et1 = elapsed * 0.01;
    const et2 = elapsed * 0.008;
    const et3 = elapsed * 0.006;

    for (let i = 0, i3 = 0; i < pos.length / 3; i++, i3 += 3) {
      const p = phases[i];
      const drift = 0.5 + Math.sin(et1 * 0.5 + p * 0.1) * 0.5;
      const drift10 = drift * 10;

      // 基础漂浮
      let px = init[i3]     + Math.sin(et1 + p) * drift10;
      let py = init[i3 + 1] + Math.cos(et2 + p * 1.5) * drift10;
      let pz = init[i3 + 2] + Math.sin(et3 + p * 2) * drift10;

      // 移动推开效果：靠近相机的粒子被推开
      if (speedFactor > 0.01 && this.camera) {
        const dx = px - this.camera.position.x;
        const dy = py - this.camera.position.y;
        const dz = pz - this.camera.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const pushRadius = 100; // 推开半径
        if (distSq < pushRadius * pushRadius) {
          const dist = Math.sqrt(distSq);
          const push = (1 - dist / pushRadius) * speedFactor * 30;
          px += vx * push;
          py += vy * push;
          pz += vz * push;
        }
      }

      pos[i3]     = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;
    }
    this.geometry.attributes.position.needsUpdate = true;

    // 脉冲透明度（移动时更亮）
    const baseOpacity = 0.1 + Math.sin(elapsed * 0.02) * 0.05;
    this.material.opacity = baseOpacity + speedFactor * 0.1;
  }

  /**
   * 重新居中粒子系统到相机位置
   */
  recenterParticles(spread) {
    const camPos = this.camera.position;
    this._centerPos.copy(camPos);

    const pos = this.positions;
    const init = this.initialPositions;
    const count = pos.length / 3;

    for (let i = 0, i3 = 0; i < count; i++, i3 += 3) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.2 + Math.random() * 0.8);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      // 初始位置（漂浮动画的基准点）以相机为中心
      init[i3]     = camPos.x + x;
      init[i3 + 1] = camPos.y + y;
      init[i3 + 2] = camPos.z + z;

      // 当前位置设为初始位置（漂浮动画会在此基础上偏移）
      pos[i3]     = init[i3];
      pos[i3 + 1] = init[i3 + 1];
      pos[i3 + 2] = init[i3 + 2];
    }
  }

  dispose(scene) {
    if (this.points) scene.remove(this.points);
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}
