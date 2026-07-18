/**
 * 跟踪视角控制器
 * 选择天体后相机平滑飞到合适位置，用 OrbitControls 环绕+缩放，天体运动时自动跟随。
 * 参考 Three.js OrbitControls + 社区"跟随运动目标"实践：
 *   每帧 controls.target.copy(targetWorldPos) + controls.update()，
 *   OrbitControls 维护相机相对 target 的球面偏移，target 运动时相机自动跟随。
 *
 * 关键：transition 期间每帧重新算 toPos（跟随 planet 移动），
 *   避免 camera 落在旧 worldPos 附近、planet 已飞到新位置造成的"距离 = 移动量 + dist"问题。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from '../core/config.js';

export class TrackingController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.controls = null;
    this.targets = [];        // [{ name, type, getWorldPos(vec3)->vec3, radius }]
    this.currentIndex = -1;
    this.active = false;
    this.transitioning = false;
    this.transitionT = 0;
    this.transitionDuration = 1.5;
    this._exiting = false;

    // 复用临时向量，避免每帧 GC
    this._fromPos = new THREE.Vector3();
    this._fromQuat = new THREE.Quaternion();
    this._toPos = new THREE.Vector3();
    this._toQuat = new THREE.Quaternion();
    this._targetWorldPos = new THREE.Vector3();
    this._savedPos = new THREE.Vector3();      // 进入跟踪前的第一人称位置
    this._savedQuat = new THREE.Quaternion();  // 进入跟踪前的第一人称朝向
    this._dir = new THREE.Vector3();
    this._m4 = new THREE.Matrix4();
    this._offsetVec = new THREE.Vector3();
    this._lastTarget = new THREE.Vector3(); // 上一帧 target 位置，用于算 targetDelta
    this._targetDelta = new THREE.Vector3();
    this._hasLastTarget = false;
    this._onExit = null;
  }

  init() {
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = config.tracking?.dampingFactor ?? 0.08;
    this.controls.enableZoom = true;   // 显式启用滚轮缩放
    this.controls.enablePan = true;    // 右键平移
    this.controls.enabled = false; // 默认禁用，进入跟踪时启用
    this.transitionDuration = config.tracking?.transitionDuration ?? 1.5;
  }

  setTargets(targets) { this.targets = targets; }
  setOnExit(cb) { this._onExit = cb; }
  isActive() { return this.active; }
  getCurrentName() {
    return this.currentIndex >= 0 ? (this.targets[this.currentIndex]?.name ?? null) : null;
  }
  getCurrentType() {
    return this.currentIndex >= 0 ? (this.targets[this.currentIndex]?.type ?? null) : null;
  }
  getTargets() { return this.targets; }

  /** 进入跟踪指定天体（保存第一人称状态） */
  enter(index) {
    if (index < 0 || index >= this.targets.length) return;
    const target = this.targets[index];
    if (!target) return;
    this._savedPos.copy(this.camera.position);
    this._savedQuat.copy(this.camera.quaternion);
    this.currentIndex = index;
    this.active = true;
    this.transitioning = true;
    this.transitionT = 0;
    this._exiting = false;
    this.controls.enabled = false;
    this._setupTransition(target);
  }

  /** 跟踪中切换天体（沿用已保存的第一人称状态） */
  switchTo(index) {
    if (index < 0 || index >= this.targets.length) return;
    const target = this.targets[index];
    if (!target) return;
    this.currentIndex = index;
    this.transitioning = true;
    this.transitionT = 0;
    this._exiting = false;
    this.controls.enabled = false;
    this._setupTransition(target);
  }

  /** 计算过渡起点/终点 + OrbitControls 配置 */
  _setupTransition(target) {
    const worldPos = target.getWorldPos(this._targetWorldPos);
    const radius = target.radius || 10;
    // 默认距离系数：通过 config.tracking.distanceFactor 调整（用户可在 config.js 改）
    // 默认 3.5：地球 dist=70 占屏幕 ~37%、木星 dist=227 占屏幕 ~32%（统一屏幕占比）
    const distFactor = config.tracking?.distanceFactor ?? 3.5;
    const dist = Math.max(radius * distFactor, radius + 5);

    // 方向：优先用目标运动方向的反方（后方跟随，像第三人称追飞船），
    // 否则用当前相机到 target 的方向
    if (target.getVelocityDir) {
      target.getVelocityDir(this._dir);
      this._dir.negate();
      if (this._dir.lengthSq() < 0.01) this._dir.set(0, 0.3, 1);
      this._dir.normalize();
    } else {
      this._dir.subVectors(this.camera.position, worldPos);
      if (this._dir.lengthSq() < 1) this._dir.set(0, 0.3, 1);
      this._dir.normalize();
    }

    this._fromPos.copy(this.camera.position);
    this._fromQuat.copy(this.camera.quaternion);
    this._toPos.copy(worldPos).addScaledVector(this._dir, dist);
    this._currentDist = dist;

    // 朝向 target
    this._m4.lookAt(this._toPos, worldPos, this.camera.up);
    this._toQuat.setFromRotationMatrix(this._m4);

    // OrbitControls 距离限制
    this.controls.target.copy(worldPos);
    this.controls.minDistance = Math.max(radius * 0.5, 5);
    this.controls.maxDistance = radius * (config.tracking?.maxDistanceFactor ?? 50);

    // 重置 _lastTarget，让 transition 完成后下一帧才开始 delta 跟随
    this._hasLastTarget = false;

    if (typeof window !== 'undefined' && window.location?.search?.includes('tracking-debug')) {
      console.log(`[tracking-debug] ${target.name} radius=${radius} distFactor=${distFactor} dist=${dist.toFixed(2)} worldPos=[${worldPos.x.toFixed(0)},${worldPos.y.toFixed(0)},${worldPos.z.toFixed(0)}] toPos=[${this._toPos.x.toFixed(0)},${this._toPos.y.toFixed(0)},${this._toPos.z.toFixed(0)}]`);
    }
  }

  /** 退出跟踪，平滑回到第一人称位置 */
  exit() {
    if (!this.active) return;
    this.transitioning = true;
    this.transitionT = 0;
    this._exiting = true;
    this.controls.enabled = false;
    this._fromPos.copy(this.camera.position);
    this._fromQuat.copy(this.camera.quaternion);
    this._toPos.copy(this._savedPos);
    this._toQuat.copy(this._savedQuat);
  }

  /** Tab 切换下一个/上一个天体 */
  nextTarget(dir = 1) {
    if (this.targets.length === 0) return -1;
    let next = this.currentIndex + dir;
    if (next >= this.targets.length) next = 0;
    if (next < 0) next = this.targets.length - 1;
    this.switchTo(next);
    return next;
  }

  update(delta) {
    if (!this.active) return;
    const target = this.targets[this.currentIndex];
    if (!target) return;

    if (this.transitioning) {
      this.transitionT += delta / this.transitionDuration;
      const t = Math.min(1, this.transitionT);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // 关键修复：进入过程中 planet 仍在运动，每帧重算 toPos 让 camera 跟随
      // 否则 t=1 时 camera 在旧 worldPos 附近、planet 已飞到新位置，distance = 移动量 + dist
      if (!this._exiting) {
        const curWorldPos = target.getWorldPos(this._targetWorldPos);
        this._toPos.copy(curWorldPos).addScaledVector(this._dir, this._currentDist);
        this._m4.lookAt(this._toPos, curWorldPos, this.camera.up);
        this._toQuat.setFromRotationMatrix(this._m4);
      }

      this.camera.position.lerpVectors(this._fromPos, this._toPos, ease);
      this.camera.quaternion.slerpQuaternions(this._fromQuat, this._toQuat, ease);

      if (t >= 1) {
        this.transitioning = false;
        if (this._exiting) {
          this._exiting = false;
          this.active = false;
          this.currentIndex = -1;
          if (this._onExit) this._onExit();
        } else {
          // 同步到最新 target，启用 OrbitControls
          const worldPos = target.getWorldPos(this._targetWorldPos);
          this.controls.target.copy(worldPos);
          this.controls.enabled = true;
        }
      }
      return;
    }

    // 稳定跟踪：天体运动时相机平滑跟随
    // 关键：先算 target 这一帧的位移 Δ，把 camera 也平移 Δ（保持 offset 不变），
    // 再让 OrbitControls 处理用户输入（zoom/rotate）。这样 OrbitControls 内部 spherical
    // 不会因 target 跳变而重算，避免运动快天体（彗星、内行星）的抖动。
    const worldPos = target.getWorldPos(this._targetWorldPos);
    if (this._hasLastTarget) {
      this._targetDelta.subVectors(worldPos, this._lastTarget);
      this.camera.position.add(this._targetDelta); // 相机跟着 target 平移
    }
    this.controls.target.copy(worldPos);
    this.controls.update();
    this._lastTarget.copy(worldPos);
    this._hasLastTarget = true;
  }

  dispose() {
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
  }
}
