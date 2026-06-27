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
    this._velocity = new THREE.Vector3(); // 缓存速度方向
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

    console.log('[SpeedLines] 速度线系统初始化完成（方向感知 LineSegments）');
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

    // 在垂直于移动方向的平面上随机分布
    // 构建局部坐标系
    const forward = new THREE.Vector3(dx, dy, dz);
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    if (Math.abs(forward.y) > 0.99) {
      right.set(1, 0, 0);
      up.set(0, 0, forward.y > 0 ? -1 : 1);
    } else {
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      up.crossVectors(right, forward).normalize();
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = cfg.minRadius + Math.random() * (cfg.maxRadius - cfg.minRadius);
    const spreadX = Math.cos(angle) * radius;
    const spreadY = Math.sin(angle) * radius;

    const x = right.x * spreadX + up.x * spreadY;
    const y = right.y * spreadX + up.y * spreadY;
    const z = right.z * spreadX + up.z * spreadY;

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

    // 颜色渐变：起点偏蓝 → 终点偏白
    const brightness = 0.7 + Math.random() * 0.3;
    const blueShift = Math.random() * 0.3;

    this.colors[i3_0] = 0.4 + blueShift;
    this.colors[i3_0 + 1] = 0.5 + blueShift * 0.5;
    this.colors[i3_0 + 2] = 1.0;

    this.colors[i3_1] = 0.7 + brightness * 0.3;
    this.colors[i3_1 + 1] = 0.8 + brightness * 0.2;
    this.colors[i3_1 + 2] = 1.0;

    if (this.geometry) {
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  update(delta, speed, velocity) {
    this.speed = speed;

    // 缓存速度方向
    if (velocity) {
      this._velocity.copy(velocity);
    }

    const targetOpacity = speed > this.cfg.speedThreshold ? Math.min(speed / 20, this.cfg.opacityTarget) : 0;
    this.material.opacity += (targetOpacity - this.material.opacity) * this.cfg.opacitySpeed;

    if (speed < this.cfg.speedThreshold) return;

    // 计算主移动方向（相机空间）
    const dir = this._velocity.clone();
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
  }

  dispose() {
    if (this.camera && this.lineSegments) {
      this.camera.remove(this.lineSegments);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}
