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
  }

  /**
   * 初始化相机
   */
  init() {
    const { fov, near, far, startPosition } = config.camera;

    this.camera = new THREE.PerspectiveCamera(fov, this.aspect, near, far);
    this.camera.position.set(startPosition.x, startPosition.y, startPosition.z);

    console.log('[CameraController] 相机初始化完成');
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
