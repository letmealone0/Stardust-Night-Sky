/**
 * 后处理效果管理器
 * 直接渲染，不使用后处理效果
 */

import * as THREE from 'three';

export class PostProcessingManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * 初始化后处理
   */
  init() {
    console.log('[PostProcessingManager] 后处理初始化完成（直接渲染模式）');
  }

  /**
   * 渲染 - 直接渲染场景
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 窗口大小变化
   */
  onResize() {
    // 无需处理
  }

  /**
   * 销毁后处理
   */
  dispose() {
    // 无需处理
  }
}
