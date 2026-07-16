/**
 * 速度线系统 v19.1
 *
 * 设计原理：
 * - 线段挂载在场景中的跟随 Group（随相机移动+旋转）
 * - Group 每帧同步到相机，Group-local = camera-local
 * - 线段出生在 +localVel 方向（运动前方），沿 -localVel 流向相机
 * - 分布在以流动方向为轴的圆柱体中
 * - 冲刺线更亮、更长、颜色更暖
 *
 * 关键教训：不能 camera.add(segments)，必须挂到 scene 中的 Group 才能被渲染。
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class SpeedLines {
  constructor() {
    this.group = new THREE.Group();
    this.cfg = config.speedLines;
    this.lineCount = this.cfg.count || 1500;
    this.geometry = null;
    this.material = null;
    this.lineSegments = null;
    this.positions = null;
    this.colors = null;
    this.speed = 0;
    this.camera = null;
    this._worldVel = new THREE.Vector3();
    this._localVel = new THREE.Vector3();
    this._invQuat = new THREE.Quaternion();

    this.sprintLines = null;
    this.sprintMaterial = null;
    this.sprintPositions = null;
    this.sprintColors = null;
    this.springCount = this.cfg.sprintExtraCount || 200;
  }

  init(scene, camera) {
    this.camera = camera;

    // 创建跟随 group，添加到场景
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    scene.add(this.group);

    const vertexCount = this.lineCount * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);

    const defaultDir = new THREE.Vector3(0, 0, -1);
    for (let i = 0; i < this.lineCount; i++) {
      this.resetLine(i, defaultDir);
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
    this.group.add(this.lineSegments);

    // 冲刺额外亮线
    const sprintVertexCount = this.springCount * 2;
    this.sprintPositions = new Float32Array(sprintVertexCount * 3);
    this.sprintColors = new Float32Array(sprintVertexCount * 3);

    for (let i = 0; i < this.springCount; i++) {
      this.resetSprintLine(i, defaultDir);
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
    this.group.add(this.sprintLines);

    console.log('[SpeedLines] v19.1 速度线系统初始化完成（主线:', this.lineCount, '+ 冲刺线:', this.springCount, ')');
  }

  /**
   * 构建垂直于 flowDir 的两个基向量
   * @returns {{ right: THREE.Vector3, up: THREE.Vector3 }}
   */
  _buildPerpBasis(flowDir) {
    if (!this._perpRight) this._perpRight = new THREE.Vector3();
    if (!this._perpUp) this._perpUp = new THREE.Vector3();
    if (!this._worldUp) this._worldUp = new THREE.Vector3(0, 1, 0);

    const fd = flowDir;
    if (Math.abs(fd.y) > 0.99) {
      this._perpRight.set(1, 0, 0);
      this._perpUp.set(0, 0, fd.y > 0 ? -1 : 1);
    } else {
      this._perpRight.crossVectors(fd, this._worldUp).normalize();
      this._perpUp.crossVectors(this._perpRight, fd).normalize();
    }
    return { right: this._perpRight, up: this._perpUp };
  }

  /**
   * 重置一条速度线
   * @param {number} i - 线段索引
   * @param {THREE.Vector3} flowDir - 相机局部空间的移动方向（归一化）
   *   线段出生在 +flowDir 方向（运动前方），随后沿 -flowDir 流向相机
   */
  resetLine(i, flowDir) {
    const i2 = i * 2;
    const i3_0 = i2 * 3;
    const i3_1 = (i2 + 1) * 3;
    const cfg = this.cfg;

    const fx = flowDir.x, fy = flowDir.y, fz = flowDir.z;

    const { right, up } = this._buildPerpBasis(flowDir);
    const angle = Math.random() * Math.PI * 2;

    // v19.5: sqrt分布 → 更多线段在边缘（大半径），中心清空
    const rFrac = 0.2 + Math.random() * 0.8;
    const radius = cfg.minRadius + (cfg.maxRadius - cfg.minRadius) * Math.sqrt(rFrac);

    const offsetX = right.x * Math.cos(angle) * radius + up.x * Math.sin(angle) * radius;
    const offsetY = right.y * Math.cos(angle) * radius + up.y * Math.sin(angle) * radius;
    const offsetZ = right.z * Math.cos(angle) * radius + up.z * Math.sin(angle) * radius;

    const segLen = cfg.minLength + Math.random() * (cfg.maxLength - cfg.minLength);

    const nearDist = Math.abs(cfg.zEnd);
    const farDist = Math.abs(cfg.zStart);
    const axisPos = nearDist + Math.random() * (farDist - nearDist);

    const halfLen = segLen / 2;
    const cx = fx * axisPos + offsetX;
    const cy = fy * axisPos + offsetY;
    const cz = fz * axisPos + offsetZ;

    this.positions[i3_0]     = cx + fx * halfLen;
    this.positions[i3_0 + 1] = cy + fy * halfLen;
    this.positions[i3_0 + 2] = cz + fz * halfLen;

    this.positions[i3_1]     = cx - fx * halfLen;
    this.positions[i3_1 + 1] = cy - fy * halfLen;
    this.positions[i3_1 + 2] = cz - fz * halfLen;

    // v19.5: 边缘偏冷蓝，内圈偏暖 → 屏幕边缘有蓝色微光
    const edge = (radius - cfg.minRadius) / Math.max(cfg.maxRadius - cfg.minRadius, 1);
    const r_col = 0.3 + edge * 0.2;
    const g_col = 0.45 + edge * 0.3;
    const b_col = 0.6 + edge * 0.4;

    this.colors[i3_0]     = r_col;
    this.colors[i3_0 + 1] = g_col;
    this.colors[i3_0 + 2] = b_col;

    this.colors[i3_1]     = r_col + 0.12;
    this.colors[i3_1 + 1] = g_col + 0.08;
    this.colors[i3_1 + 2] = b_col + 0.08;

    if (this.geometry) {
      this.geometry.attributes.color.needsUpdate = true;
    }
  }

  /**
   * 重置冲刺专用亮线
   * 更亮、更长、从中心向外辐射
   */
  resetSprintLine(i, flowDir) {
    const i2 = i * 2;
    const i3_0 = i2 * 3;
    const i3_1 = (i2 + 1) * 3;
    const cfg = this.cfg;

    const { right, up } = this._buildPerpBasis(flowDir);
    const angle = Math.random() * Math.PI * 2;
    const radius = cfg.minRadius * 0.2 + Math.random() * (cfg.maxRadius * 0.3);

    const offsetX = right.x * Math.cos(angle) * radius + up.x * Math.sin(angle) * radius;
    const offsetY = right.y * Math.cos(angle) * radius + up.y * Math.sin(angle) * radius;
    const offsetZ = right.z * Math.cos(angle) * radius + up.z * Math.sin(angle) * radius;

    const segLen = cfg.minLength * 0.6 + Math.random() * (cfg.maxLength * 0.4);
    const nearDist = Math.abs(cfg.zEnd);
    const farDist = Math.abs(cfg.zStart);
    // 冲刺线出生在较近处，快速飞过
    const axisPos = nearDist + Math.random() * (farDist * 0.4);

    const fx = flowDir.x, fy = flowDir.y, fz = flowDir.z;
    const halfLen = segLen / 2;
    const cx = fx * axisPos + offsetX;
    const cy = fy * axisPos + offsetY;
    const cz = fz * axisPos + offsetZ;

    this.sprintPositions[i3_0]     = cx + fx * halfLen;
    this.sprintPositions[i3_0 + 1] = cy + fy * halfLen;
    this.sprintPositions[i3_0 + 2] = cz + fz * halfLen;

    this.sprintPositions[i3_1]     = cx - fx * halfLen;
    this.sprintPositions[i3_1 + 1] = cy - fy * halfLen;
    this.sprintPositions[i3_1 + 2] = cz - fz * halfLen;

    // 暖白/亮蓝混合颜色
    const isWarm = Math.random() > 0.8;
    this.sprintColors[i3_0]     = isWarm ? 1.0 : 0.5;
    this.sprintColors[i3_0 + 1] = isWarm ? 0.85 : 0.65;
    this.sprintColors[i3_0 + 2] = isWarm ? 0.6 : 1.0;

    this.sprintColors[i3_1]     = isWarm ? 1.0 : 0.75;
    this.sprintColors[i3_1 + 1] = isWarm ? 0.92 : 0.82;
    this.sprintColors[i3_1 + 2] = isWarm ? 0.75 : 1.0;
  }

  update(delta, speed, velocity, maxSpeedOverride, sprintMultiplierOverride) {
    this.speed = speed;

    // 同步跟随 group 到相机
    this.group.position.copy(this.camera.position);
    this.group.quaternion.copy(this.camera.quaternion);

    if (velocity) {
      this._worldVel.copy(velocity);
    }

    // 世界速度 → group-local 方向
    const vLen = this._worldVel.length();
    if (vLen > 0.01) {
      this._invQuat.copy(this.group.quaternion).invert();
      this._localVel.copy(this._worldVel).applyQuaternion(this._invQuat).normalize();
    } else {
      this._localVel.set(0, 0, -1);
    }

    // v19.4: 速度线仅在冲刺时可见，使用当前模式的参数
    const maxSpd = maxSpeedOverride || config.player.maxSpeed;
    const sprintMul = sprintMultiplierOverride || config.player.sprintMultiplier || 3.0;
    const sprintSpeed = maxSpd * sprintMul;
    const isSprinting = speed > sprintSpeed * 0.6;
    const targetOpacity = isSprinting
      ? Math.min((speed - sprintSpeed * 0.6) / (sprintSpeed * 0.4), 1.0) * this.cfg.opacityTarget
      : 0;
    this.material.opacity += (targetOpacity - this.material.opacity) * (isSprinting ? 0.4 : 0.08);

    const sprintTarget = isSprinting ? 1.2 : 0;
    if (this.sprintMaterial) {
      this.sprintMaterial.opacity += (sprintTarget - this.sprintMaterial.opacity) * 0.3;
    }

    if (!isSprinting && this.material.opacity < 0.005) return;

    // 流动方向：沿 -localVel（环境掠过相机）
    const lx = -this._localVel.x;
    const ly = -this._localVel.y;
    const lz = -this._localVel.z;
    const move = speed * delta * this.cfg.moveFactor;
    const spawnDistSq = (Math.abs(this.cfg.zStart) * 1.3) ** 2;
    const nearDistSq = Math.abs(this.cfg.zEnd) ** 2;

    for (let i = 0; i < this.lineCount; i++) {
      const i2 = i * 2;
      const i3_0 = i2 * 3;
      const i3_1 = (i2 + 1) * 3;

      this.positions[i3_0]     += lx * move;
      this.positions[i3_0 + 1] += ly * move;
      this.positions[i3_0 + 2] += lz * move;
      this.positions[i3_1]     += lx * move;
      this.positions[i3_1 + 1] += ly * move;
      this.positions[i3_1 + 2] += lz * move;

      const px = this.positions[i3_0];
      const py = this.positions[i3_0 + 1];
      const pz = this.positions[i3_0 + 2];
      const distSq = px * px + py * py + pz * pz;

      if (distSq > spawnDistSq || distSq < nearDistSq * 0.25) {
        this.resetLine(i, this._localVel);
      }
    }
    this.geometry.attributes.position.needsUpdate = true;

    if (this.sprintPositions && this.sprintMaterial && this.sprintMaterial.opacity > 0.01) {
      const sprintMove = move * 1.5;
      for (let i = 0; i < this.springCount; i++) {
        const i2 = i * 2;
        const i3_0 = i2 * 3;
        const i3_1 = (i2 + 1) * 3;

        this.sprintPositions[i3_0]     += lx * sprintMove;
        this.sprintPositions[i3_0 + 1] += ly * sprintMove;
        this.sprintPositions[i3_0 + 2] += lz * sprintMove;
        this.sprintPositions[i3_1]     += lx * sprintMove;
        this.sprintPositions[i3_1 + 1] += ly * sprintMove;
        this.sprintPositions[i3_1 + 2] += lz * sprintMove;

        const px = this.sprintPositions[i3_0];
        const py = this.sprintPositions[i3_0 + 1];
        const pz = this.sprintPositions[i3_0 + 2];
        if (px * px + py * py + pz * pz > spawnDistSq * 0.5) {
          this.resetSprintLine(i, this._localVel);
        }
      }
      if (this.sprintLines && this.sprintLines.geometry) {
        this.sprintLines.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  dispose() {
    if (this.group) {
      if (this.lineSegments) this.group.remove(this.lineSegments);
      if (this.sprintLines) this.group.remove(this.sprintLines);
      if (this.group.parent) this.group.parent.remove(this.group);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.sprintLines && this.sprintLines.geometry) this.sprintLines.geometry.dispose();
    if (this.sprintMaterial) this.sprintMaterial.dispose();
  }
}
