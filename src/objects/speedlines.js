import * as THREE from 'three';
import { config } from '../core/config.js';

export class SpeedLines {
  constructor() {
    this.group = new THREE.Group();
    this.cfg = config.speedLines;
    this.lineCount = this.cfg.count || 1000;
    this.geometry = null;
    this.material = null;
    this.lineSegments = null;
    this.positions = null;
    this.colors = null;
    this.speed = 0;
    this.camera = null;
    this._velocity = new THREE.Vector3();
    // v8.0: 冲刺额外线段
    this.sprintLines = null;
    this.sprintMaterial = null;
    this.sprintPositions = null;
    this.sprintColors = null;
    this.springCount = this.cfg.sprintExtraCount || 200;
  }

  init(scene, camera) {
    this.camera = camera;

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

    // v8.0: 冲刺额外亮线（更亮、更宽、从中心辐射）
    const sprintVertexCount = this.springCount * 2;
    this.sprintPositions = new Float32Array(sprintVertexCount * 3);
    this.sprintColors = new Float32Array(sprintVertexCount * 3);

    for (let i = 0; i < this.springCount; i++) {
      this.resetSprintLine(i);
    }

    const sprintGeo = new THREE.BufferGeometry();
    sprintGeo.setAttribute('position', new THREE.BufferAttribute(this.sprintPositions, 3));
    sprintGeo.setAttribute('color', new THREE.BufferAttribute(this.sprintColors, 3));

    this.sprintMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    });

    this.sprintLines = new THREE.LineSegments(sprintGeo, this.sprintMaterial);
    this.camera.add(this.sprintLines);

    console.log('[SpeedLines] v8.0 速度线系统初始化完成（主线:', this.lineCount, '+ 冲刺线:', this.springCount, ')');
  }

  /**
   * 重置一条速度线
   * @param {number} i - 线段索引
   * @param {THREE.Vector3} dir - 移动方向（相机空间，可选，默认向前）
   */
  resetLine(i, dir) {
    const i2 = i * 2;
    const i3_0 = i2 * 3;
    const i3_1 = (i2 + 1) * 3;

    const cfg = this.cfg;

    // 根据移动方向选择速度线的分布区域
    let dx = 0, dy = 0, dz = -1; // 默认向后（向前移动时线从前方飞来）
    if (dir && dir.lengthSq() > 0.01) {
      // 归一化方向，取反（线段从移动方向的反方向飞来）
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      dx = -dir.x / len;
      dy = -dir.y / len;
      dz = -dir.z / len;
    }

    // 构建局部坐标系（复用临时向量）
    if (!this._tmpForward) this._tmpForward = new THREE.Vector3();
    if (!this._tmpRight) this._tmpRight = new THREE.Vector3();
    if (!this._tmpUp) this._tmpUp = new THREE.Vector3();
    if (!this._tmpWorldUp) this._tmpWorldUp = new THREE.Vector3(0, 1, 0);
    this._tmpForward.set(dx, dy, dz);
    this._tmpRight.set(0, 0, 0);
    this._tmpUp.set(0, 0, 0);

    if (Math.abs(this._tmpForward.y) > 0.99) {
      this._tmpRight.set(1, 0, 0);
      this._tmpUp.set(0, 0, this._tmpForward.y > 0 ? -1 : 1);
    } else {
      this._tmpRight.crossVectors(this._tmpForward, this._tmpWorldUp).normalize();
      this._tmpUp.crossVectors(this._tmpRight, this._tmpForward).normalize();
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = cfg.minRadius + Math.random() * (cfg.maxRadius - cfg.minRadius);
    const spreadX = Math.cos(angle) * radius;
    const spreadY = Math.sin(angle) * radius;

    const x = this._tmpRight.x * spreadX + this._tmpUp.x * spreadY;
    const y = this._tmpRight.y * spreadX + this._tmpUp.y * spreadY;
    const z = this._tmpRight.z * spreadX + this._tmpUp.z * spreadY;

    // 线段沿移动反方向延伸
    const length = cfg.minLength + Math.random() * (cfg.maxLength - cfg.minLength);
    const nearDist = Math.abs(cfg.zEnd);
    const farDist = Math.abs(cfg.zStart);
    const offset = nearDist + Math.random() * (farDist - nearDist);

    // 起点（远离相机）
    this.positions[i3_0]     = x + dx * offset;
    this.positions[i3_0 + 1] = y + dy * offset;
    this.positions[i3_0 + 2] = z + dz * offset;

    // 终点（朝相机方向，偏移 length）
    this.positions[i3_1]     = x + dx * (offset - length);
    this.positions[i3_1 + 1] = y + dy * (offset - length);
    this.positions[i3_1 + 2] = z + dz * (offset - length);

    // 颜色渐变：起点偏蓝 → 终点偏白 (v16: 更亮)
    const brightness = 0.8 + Math.random() * 0.2;
    const blueShift = Math.random() * 0.2;

    this.colors[i3_0] = 0.5 + blueShift;
    this.colors[i3_0 + 1] = 0.6 + blueShift * 0.5;
    this.colors[i3_0 + 2] = 1.0;

    this.colors[i3_1] = 0.85 + brightness * 0.15;
    this.colors[i3_1 + 1] = 0.9 + brightness * 0.1;
    this.colors[i3_1 + 2] = 1.0;

    if (this.geometry) {
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  /**
   * 重置冲刺专用亮线（v8.0）
   * 更亮、从中心辐射、颜色偏暖白
   */
  resetSprintLine(i) {
    const i2 = i * 2;
    const i3_0 = i2 * 3;
    const i3_1 = (i2 + 1) * 3;
    const cfg = this.cfg;

    // 从中心向外辐射
    const angle = Math.random() * Math.PI * 2;
    const radius = cfg.minRadius * 0.3 + Math.random() * (cfg.maxRadius * 0.5 - cfg.minRadius * 0.3);

    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = 0;

    const length = cfg.minLength * 0.8 + Math.random() * (cfg.maxLength * 0.6);
    const offset = Math.abs(cfg.zEnd) + Math.random() * (Math.abs(cfg.zStart) * 0.5);

    this.sprintPositions[i3_0]     = x;
    this.sprintPositions[i3_0 + 1] = y;
    this.sprintPositions[i3_0 + 2] = z + offset;

    this.sprintPositions[i3_1]     = x;
    this.sprintPositions[i3_1 + 1] = y;
    this.sprintPositions[i3_1 + 2] = z + offset + length;

    // 暖白/亮蓝混合颜色
    const isWarm = Math.random() > 0.85;
    this.sprintColors[i3_0] = isWarm ? 1.0 : 0.6;
    this.sprintColors[i3_0 + 1] = isWarm ? 0.9 : 0.7;
    this.sprintColors[i3_0 + 2] = isWarm ? 0.7 : 1.0;

    this.sprintColors[i3_1] = isWarm ? 1.0 : 0.8;
    this.sprintColors[i3_1 + 1] = isWarm ? 0.95 : 0.85;
    this.sprintColors[i3_1 + 2] = isWarm ? 0.8 : 1.0;
  }

  update(delta, speed, velocity) {
    this.speed = speed;

    if (velocity) {
      this._velocity.copy(velocity);
    }

    const targetOpacity = speed > this.cfg.speedThreshold ? Math.min(speed / 20, this.cfg.opacityTarget) : 0;
    this.material.opacity += (targetOpacity - this.material.opacity) * this.cfg.opacitySpeed;

    // v8.0: 冲刺线透明度（仅在高速时可见）
    const sprintTarget = speed > config.player.maxSpeed * config.player.sprintMultiplier * 0.5 ? 1.2 : 0;
    if (this.sprintMaterial) {
      this.sprintMaterial.opacity += (sprintTarget - this.sprintMaterial.opacity) * 0.3;
    }

    if (speed < this.cfg.speedThreshold) return;

    // v16: 修正流向 — 取反Y/Z得到正确的摄像机相对流向
    if (!this._dirCache) this._dirCache = new THREE.Vector3();
    this._dirCache.set(this._velocity.x, -this._velocity.y, -this._velocity.z);
    const dir = this._dirCache;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);

    for (let i = 0; i < this.lineCount; i++) {
      const i2 = i * 2;
      const i3_0 = i2 * 3;
      const i3_1 = (i2 + 1) * 3;

      // 沿移动反方向推进线段
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
      if (len > 0.01) {
        const nx = dir.x / len;
        const ny = dir.y / len;
        const nz = dir.z / len;
        const move = speed * delta * this.cfg.moveFactor;

        this.positions[i3_0]     += nx * move;
        this.positions[i3_0 + 1] += ny * move;
        this.positions[i3_0 + 2] += nz * move;
        this.positions[i3_1]     += nx * move;
        this.positions[i3_1 + 1] += ny * move;
        this.positions[i3_1 + 2] += nz * move;
      }

      // 检查是否飞过相机（简化：距离相机太近则重置）
      const px = this.positions[i3_0];
      const py = this.positions[i3_0 + 1];
      const pz = this.positions[i3_0 + 2];
      const distSq = px * px + py * py + pz * pz;

      if (distSq > 10000 || distSq < 25) { // 太远或太近都重置
        this.resetLine(i, dir);
      }
    }

    this.geometry.attributes.position.needsUpdate = true;

    // v8.0: 冲刺线更新（只在冲刺时处理）
    if (this.sprintPositions && this.sprintMaterial && this.sprintMaterial.opacity > 0.01) {
      const sprintMove = speed * delta * this.cfg.moveFactor * 1.5;
      for (let i = 0; i < this.springCount; i++) {
        const i2 = i * 2;
        const i3_0 = i2 * 3;
        const i3_1 = (i2 + 1) * 3;

        this.sprintPositions[i3_0 + 2] += sprintMove;
        this.sprintPositions[i3_1 + 2] += sprintMove;

        // 超出范围则重置
        if (this.sprintPositions[i3_0 + 2] > 50) {
          this.resetSprintLine(i);
        }
      }
      if (this.sprintLines && this.sprintLines.geometry) {
        this.sprintLines.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  dispose() {
    if (this.camera) {
      if (this.lineSegments) this.camera.remove(this.lineSegments);
      if (this.sprintLines) this.camera.remove(this.sprintLines);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.sprintLines && this.sprintLines.geometry) this.sprintLines.geometry.dispose();
    if (this.sprintMaterial) this.sprintMaterial.dispose();
  }
}
