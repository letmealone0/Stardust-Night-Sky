/**
 * 相机控制器
 * 管理 PerspectiveCamera 和视角控制
 */

import * as THREE from 'three';
import { config } from './config.js';

export class CameraController {
  constructor() {
    this.camera = null;
    this.aspect = window.innerWidth / window.innerHeight;
    this._currentMode = config.camera.defaultMode || 'close';
    // 注意：FOV 运行时由 PlayerController 管理（冲刺 FOV 扩展），
    // CameraController 仅负责 near/far 平滑过渡，避免两者互相覆盖。
    this._targetNear = config.camera.near;
    this._targetFar = config.camera.far;
  }

  /**
   * 初始化相机
   */
  init() {
    const { fov, near, far, startPosition } = config.camera;

    this.camera = new THREE.PerspectiveCamera(fov, this.aspect, near, far);
    this.camera.position.set(startPosition.x, startPosition.y, startPosition.z);

    // 应用默认模式
    const defaultMode = config.camera.defaultMode || 'close';
    this.applyMode(defaultMode, false);

    console.log('[CameraController] 相机初始化完成，模式:', defaultMode);
  }

  /**
   * 应用相机视角模式
   * @param {string} mode - 'close' | 'wide'
   * @param {boolean} smooth - 是否使用当前参数插值到目标
   */
  applyMode(mode, smooth = true) {
    const modeCfg = config.camera.modes?.[mode];
    if (!modeCfg) {
      console.warn('[CameraController] 未知相机模式:', mode);
      return;
    }

    this._currentMode = mode;
    if (smooth) {
      // fov 交给 PlayerController 平滑（其 baseFov 会同步更新），
      // 这里只平滑 near/far，避免与冲刺 FOV 互相覆盖。
      this._targetNear = modeCfg.near;
      this._targetFar = modeCfg.far;
    } else {
      this.camera.fov = modeCfg.fov;
      this.camera.near = modeCfg.near;
      this.camera.far = modeCfg.far;
      this._targetNear = modeCfg.near;
      this._targetFar = modeCfg.far;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * 获取当前模式
   */
  getMode() {
    return this._currentMode;
  }

  /**
   * 每帧平滑 near/far（fov 由 PlayerController 管理，避免冲刺 FOV 被覆盖）
   */
  update(delta) {
    if (!this.camera) return;
    const damp = 1 - Math.pow(0.001, delta);

    let changed = false;
    if (Math.abs(this.camera.near - this._targetNear) > 0.01) {
      this.camera.near += (this._targetNear - this.camera.near) * damp;
      changed = true;
    }
    if (Math.abs(this.camera.far - this._targetFar) > 0.1) {
      this.camera.far += (this._targetFar - this.camera.far) * damp;
      changed = true;
    }
    if (changed) {
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * 窗口大小变化
   */
  onResize() {
    this.aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 获取相机
   */
  getCamera() {
    return this.camera;
  }

  /**
   * 销毁相机
   */
  dispose() {
    this.camera = null;
  }
}
