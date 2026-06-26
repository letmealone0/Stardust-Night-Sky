/**
 * 渲染器管理器
 * 管理 WebGLRenderer 和渲染设置
 */

import * as THREE from 'three';
import { config } from './config.js';

export class RendererManager {
  constructor() {
    this.renderer = null;
    this.canvas = null;
  }

  /**
   * 初始化渲染器
   */
  init() {
    this.canvas = document.getElementById('canvas');

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'canvas';
      document.body.appendChild(this.canvas);
    }

    const { antialias, alpha, powerPreference } = config.renderer;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias,
      alpha,
      powerPreference,
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // toneMapping 在 PostProcessingManager 中统一设置（ACESFilmicToneMapping）
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    console.log('[RendererManager] 渲染器初始化完成');
  }

  /**
   * 窗口大小变化
   */
  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /**
   * 销毁渲染器
   */
  dispose() {
    this.renderer.dispose();
  }
}
