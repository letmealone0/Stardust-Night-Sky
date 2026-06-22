/**
 * Three.js 引擎核心
 * 管理场景、相机、渲染器和渲染循环
 */

import * as THREE from 'three';
import { config } from './config.js';
import { SceneManager } from './scene.js';
import { CameraController } from './camera.js';
import { RendererManager } from './renderer.js';
import { PlayerController } from '../controls/player.js';
import { InputManager } from '../controls/input.js';
import { PostProcessingManager } from '../postprocessing/composer.js';
import { HUD } from '../ui/hud.js';

export class Engine {
  constructor() {
    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.isPaused = false;

    // 管理器实例
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.input = null;
    this.postprocessing = null;
    this.hud = null;

    // 性能监控
    this.fps = 0;
    this.frameCount = 0;
    this.lastFPSTime = 0;
  }

  /**
   * 初始化引擎
   */
  async init() {
    // 创建场景
    this.scene = new SceneManager();
    await this.scene.init();

    // 创建相机
    this.camera = new CameraController();
    this.camera.init();

    // 创建渲染器
    this.renderer = new RendererManager();
    this.renderer.init();

    // 创建输入管理
    this.input = new InputManager();
    this.input.init();

    // 创建玩家控制
    this.player = new PlayerController(
      this.camera.camera,
      this.renderer.renderer.domElement
    );
    this.player.init();

    // 创建后处理
    this.postprocessing = new PostProcessingManager(
      this.renderer.renderer,
      this.scene.scene,
      this.camera.camera
    );
    this.postprocessing.init();

    // 创建 HUD
    this.hud = new HUD();
    this.hud.init();

    // 绑定事件
    this.bindEvents();

    console.log('[Engine] 初始化完成');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 窗口大小变化
    window.addEventListener('resize', () => this.onResize());

    // 锁定/解锁鼠标
    document.addEventListener('click', () => {
      if (!this.player.controls.isLocked) {
        this.player.controls.lock();
      }
    });

    this.player.controls.addEventListener('lock', () => {
      this.isPaused = false;
      this.hud.showMessage('已锁定鼠标 - WASD移动，鼠标控制视角');
    });

    this.player.controls.addEventListener('unlock', () => {
      this.isPaused = true;
      this.hud.showMessage('点击屏幕继续探索');
    });
  }

  /**
   * 窗口大小变化处理
   */
  onResize() {
    this.camera.onResize();
    this.renderer.onResize();
    this.postprocessing.onResize();
  }

  /**
   * 启动渲染循环
   */
  start() {
    this.isRunning = true;
    this.lastFPSTime = performance.now();
    this.animate();
    console.log('[Engine] 渲染循环已启动');
  }

  /**
   * 停止渲染循环
   */
  stop() {
    this.isRunning = false;
    console.log('[Engine] 渲染循环已停止');
  }

  /**
   * 动画循环
   */
  animate() {
    if (!this.isRunning) return;

    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // 更新 FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFPSTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFPSTime = now;
      this.hud.updateFPS(this.fps);
    }

    // 如果暂停，只渲染场景
    if (this.isPaused) {
      this.postprocessing.render();
      return;
    }

    // 更新系统
    this.player.update(delta);
    this.scene.update(delta, elapsed);
    this.hud.update(delta);

    // 更新 HUD 信息
    this.hud.updateSpeed(this.player.getSpeed());
    this.hud.updatePosition(
      this.camera.camera.position.x,
      this.camera.camera.position.y,
      this.camera.camera.position.z
    );

    // 渲染
    this.postprocessing.render();
  }

  /**
   * 销毁引擎
   */
  dispose() {
    this.stop();
    this.scene.dispose();
    this.renderer.dispose();
    this.postprocessing.dispose();
    this.hud.dispose();
  }
}
