/**
 * 近处微尘层 v4 — 流动空间尘埃
 *
 * 核心设计：
 * - 粒子持续向后流动（+Z camera-local），模拟穿过空间尘埃的感觉
 * - 速度快时粒子加速流动 + 沿运动方向偏移 + 更亮
 * - 静止时微漂，避免"固定脏点"感
 * - 球形分布 + 距离远近分层，有深度视差
 * - 圆形软点贴图 + 极低不透明度
 */
import * as THREE from 'three';
import { config } from '../core/config.js';

// 圆形软点贴图
function createDustTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.25, 'rgba(220,235,255,0.55)');
  g.addColorStop(0.6, 'rgba(160,200,240,0.08)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export class NearDust {
  constructor() {
    this.followGroup = null;
    this.points = null;
    this.camera = null;
    this.scene = null;
    this._dustTex = null;
    // v4: 每个粒子的运行时状态
    this._particles = []; // { life: 0..1, speed: float, radius: float, angle: float, y0: float }
  }

  init(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    const cfg = config.nearDust || {};
    // v5: 数量减少 + 偏边缘分布 + 中心透明（避免和速度线/粒子流集中区重叠）
    const count = cfg.count || 40;
    const spread = cfg.range || 30;

    this.followGroup = new THREE.Group();
    this.followGroup.position.copy(camera.position);
    this.followGroup.quaternion.copy(camera.quaternion);
    scene.add(this.followGroup);

    this._dustTex = createDustTexture(64);

    // v5: 粒子偏向屏幕边缘分布（中心区域留给视野清晰）
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this._spawnParticle(i, positions, sizes, spread);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      // v5: 统一冷蓝灰，避免白蓝混杂
      color: 0x6688aa,
      size: 0.25,
      map: this._dustTex,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      alphaTest: 0.01,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.followGroup.add(this.points);

    this.geometry = geometry;
    this.count = count;
    this.spread = spread;

    console.log('[NearDust] v5 边缘冷蓝尘埃初始化，数量:', count);
  }

  /** v5: 在相机前方的环形体内随机生成粒子（避开屏幕中心） */
  _spawnParticle(i, posArr, sizeArr, spread) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    // v5: 半径偏向中远距离（中心 r<0.35*spread 的区域不放粒子）
    const rFrac = 0.4 + Math.random() * 0.6;
    const r = spread * rFrac;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta) * 0.55;
    // 深度变化：远→近都有分布
    const z = -spread * (0.3 + Math.random() * 0.7);

    posArr[i3] = x;
    posArr[i3 + 1] = y;
    posArr[i3 + 2] = z;
    sizeArr[i] = 0.15 + Math.random() * 0.4;

    if (!this._particles[i]) {
      this._particles[i] = {};
    }
    this._particles[i].life = Math.random();
    this._particles[i].speed = 0.06 + Math.random() * 0.18;
    this._particles[i].driftX = (Math.random() - 0.5) * 0.2;
    this._particles[i].driftY = (Math.random() - 0.5) * 0.2;
  }

  update(delta, velocity) {
    if (!this.points || !this.camera || !this.followGroup) return;

    // 同步 Group 到相机
    this.followGroup.position.copy(this.camera.position);
    this.followGroup.quaternion.copy(this.camera.quaternion);

    const speed = velocity ? velocity.length() : 0;
    const positions = this.geometry.attributes.position.array;
    const cfg = config.nearDust || {};
    const spread = this.spread;
    const dt = Math.min(delta, 0.1);

    // v4: 获取世界空间速度方向（用于粒子流动方向偏移）
    const velNorm = speed > 0.5 && velocity
      ? velocity.clone().normalize()
      : new THREE.Vector3(0, 0, 1); // 默认前方

    for (let i = 0; i < this.count; i++) {
      const p = this._particles[i];
      const i3 = i * 3;

      // v4: 粒子从远方向相机流动
      // life=0 远处（-spread）, life=1 越过相机（+spread）
      const flowRate = p.speed * (1.0 + speed * 0.04); // 速度越快流越快

      // 更新生命周期（粒子从远处流向相机）
      p.life += flowRate * dt * 0.35;
      if (p.life > 1.0) {
        // 粒子已流过相机，在远处重生
        p.life = 0;
      }

      // Z 位置：从 -spread（远处）→ +5（接近相机后方）线性映射
      const z = -spread + p.life * (spread + 5);

      // X/Y 位置：略微向外扩散（远处窄、近处宽），配合漂移
      const spreadFactor = 0.15 + p.life * 0.85;
      const baseX = p.driftX * spread * spreadFactor;
      const baseY = p.driftY * spread * spreadFactor * 0.6;

      // 速度方向偏移（高速时粒子沿速度方向偏转，模拟吹拂感）
      const flowOffset = speed * dt * 0.15;
      positions[i3] = baseX + velNorm.x * flowOffset * p.life;
      positions[i3 + 1] = baseY + velNorm.y * flowOffset * p.life;
      positions[i3 + 2] = z;
    }

    this.geometry.attributes.position.needsUpdate = true;

    // 速度越快，粒子越亮（穿过更多尘埃），但上限压低
    if (this.points.material.opacity !== undefined) {
      const baseOpacity = cfg.opacity || 0.08;
      const targetOpacity = Math.min(0.16, baseOpacity + speed * 0.003);
      this.points.material.opacity +=
        (targetOpacity - this.points.material.opacity) * Math.min(1, dt * 3);
    }

    // 速度越快，粒子越大（更明显的流线感），但增量收敛
    if (this.points.material.size !== undefined) {
      const baseSize = cfg.size || 0.25;
      const targetSize = baseSize + Math.min(0.15, speed * 0.008);
      this.points.material.size +=
        (targetSize - this.points.material.size) * Math.min(1, dt * 3);
    }
  }

  dispose() {
    if (this.followGroup) {
      if (this.points) this.followGroup.remove(this.points);
      if (this.scene) this.scene.remove(this.followGroup);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.points?.material) this.points.material.dispose();
    if (this._dustTex) this._dustTex.dispose();
    this.points = null;
    this.followGroup = null;
    this._dustTex = null;
    this._particles = [];
  }
}
