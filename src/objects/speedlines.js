import * as THREE from 'three';
import { config } from '../core/config.js';

export class SpeedLines {
  constructor() {
    this.group = new THREE.Group();
    this.cfg = config.speedLines;
    this.lineCount = this.cfg.count;
    this.geometry = null;
    this.material = null;
    this.lineSegments = null;
    this.positions = null;
    this.colors = null;
    this.speed = 0;
    this.camera = null;
  }

  init(scene, camera) {
    this.camera = camera;

    // 每个速度线是一条线段（2 个顶点），总顶点数 = lineCount * 2
    const vertexCount = this.lineCount * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < this.lineCount; i++) {
      this.resetLine(i);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    });

    this.lineSegments = new THREE.LineSegments(this.geometry, this.material);
    this.camera.add(this.lineSegments);

    console.log('[SpeedLines] 速度线系统初始化完成（LineSegments）');
  }

  resetLine(i) {
    const i2 = i * 2;
    const i3_0 = i2 * 3;
    const i3_1 = (i2 + 1) * 3;

    const angle = Math.random() * Math.PI * 2;
    const radius = this.cfg.minRadius + Math.random() * (this.cfg.maxRadius - this.cfg.minRadius);

    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    const length = this.cfg.minLength + Math.random() * (this.cfg.maxLength - this.cfg.minLength);
    const zNear = Math.abs(this.cfg.zEnd);
    const zFar = Math.abs(this.cfg.zStart);
    const zStart = -(zNear + Math.random() * (zFar - zNear));
    const zEnd = zStart + length;

    // 起点
    this.positions[i3_0] = x;
    this.positions[i3_0 + 1] = y;
    this.positions[i3_0 + 2] = zStart;

    // 终点
    this.positions[i3_1] = x;
    this.positions[i3_1 + 1] = y;
    this.positions[i3_1 + 2] = zEnd;

    // 颜色渐变：起点偏蓝 → 终点偏白
    const brightness = 0.7 + Math.random() * 0.3;
    const blueShift = Math.random() * 0.3;

    this.colors[i3_0] = 0.4 + blueShift;
    this.colors[i3_0 + 1] = 0.5 + blueShift * 0.5;
    this.colors[i3_0 + 2] = 1.0;

    this.colors[i3_1] = 0.7 + brightness * 0.3;
    this.colors[i3_1 + 1] = 0.8 + brightness * 0.2;
    this.colors[i3_1 + 2] = 1.0;

    // 颜色实际改变时才标记
    if (this.geometry) {
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  update(delta, speed) {
    this.speed = speed;

    const targetOpacity = speed > this.cfg.speedThreshold ? Math.min(speed / 20, this.cfg.opacityTarget) : 0;
    this.material.opacity += (targetOpacity - this.material.opacity) * this.cfg.opacitySpeed;

    if (speed < this.cfg.speedThreshold) return;

    for (let i = 0; i < this.lineCount; i++) {
      const i2 = i * 2;
      const i3_0 = i2 * 3;
      const i3_1 = (i2 + 1) * 3;

      const move = speed * delta * this.cfg.moveFactor;
      this.positions[i3_0 + 2] += move;
      this.positions[i3_1 + 2] += move;

      if (this.positions[i3_0 + 2] > 5) {
        this.resetLine(i);
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.camera && this.lineSegments) {
      this.camera.remove(this.lineSegments);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}
