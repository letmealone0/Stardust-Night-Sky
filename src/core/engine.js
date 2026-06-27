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
    this.postprocessing = null;
    this.hud = null;

    // 性能监控
    this.fps = 0;
    this.frameCount = 0;
    this.lastFPSTime = 0;
    // v8.0: 自适应画质
    this.lowFpsDuration = 0;
    this.qualityLevel = 1.0; // 1.0 = 全画质, 0.5 = 降质
    this.warmupTime = (config.performance?.warmupSeconds || 3);
    this.warmupStartElapsed = 0;
  }

  /**
   * 初始化引擎
   */
  async init() {
    // 校验配置
    this.validateConfig();

    // 创建相机
    this.camera = new CameraController();
    this.camera.init();

    // 创建场景（传递相机引用）
    this.scene = new SceneManager();
    await this.scene.init(this.camera.camera);

    // v7.1: 调试日志 — 确认太阳系状态
    console.log('[Engine] 太阳系状态:', this.scene.objects.solarSystem ? '已加载' : '未加载');
    if (this.scene.objects.solarSystem) {
      console.log('[Engine] 行星数量:', this.scene.objects.solarSystem.planets.length);
      console.log('[Engine] 太阳系位置:', this.scene.objects.solarSystem.group.position);
    }
    console.log('[Engine] 粒子流状态:', this.scene.objects.particleFlow ? '已加载' : '未加载');

    // 创建渲染器
    this.renderer = new RendererManager();
    this.renderer.init();

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
   * 校验运行时配置
   */
  validateConfig() {
    const { camera, player, planets } = config;
    if (camera.fov < 10 || camera.fov > 150) {
      console.warn('[Config] fov 范围异常，已重置为 75');
      camera.fov = 75;
    }
    if (player.moveSpeed <= 0) {
      console.warn('[Config] moveSpeed 必须 > 0，已重置为 50');
      player.moveSpeed = 50;
    }
    if (planets.count < 1) {
      console.warn('[Config] planets.count 必须 > 0，已重置为 8');
      planets.count = 8;
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 窗口大小变化（rAF 节流）
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
      if (resizeTimeout) return;
      resizeTimeout = requestAnimationFrame(() => {
        this.onResize();
        resizeTimeout = null;
      });
    });

    // 锁定/解锁鼠标
    document.addEventListener('click', () => {
      if (!this.player.controls.isLocked) {
        this.player.controls.lock();
      }
    });

    this.player.controls.addEventListener('lock', () => {
      this.isPaused = false;
      this.hud.showMessage('已锁定鼠标 - WASD移动 Shift冲刺 Ctrl下降 空格上升');
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
   * 启动渲染循环（使用 setAnimationLoop，自动处理 WebXR 和清理）
   */
  start() {
    this.isRunning = true;
    this.lastFPSTime = performance.now();
    this.renderer.renderer.setAnimationLoop(() => this.animate());
    console.log('[Engine] 渲染循环已启动');
  }

  /**
   * 停止渲染循环
   */
  stop() {
    this.isRunning = false;
    if (this.renderer && this.renderer.renderer) {
      this.renderer.renderer.setAnimationLoop(null);
    }
    console.log('[Engine] 渲染循环已停止');
  }

  /**
   * 动画循环
   */
  animate() {
    if (!this.isRunning) return;

    // Delta clamping: 防止 Tab 切换或掉帧导致大跳跃
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    // 更新 FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFPSTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFPSTime = now;
      this.hud.updateFPS(this.fps);

      // v8.0: 自适应画质 — 使用实际elapsed时间做预热
      if (config.performance?.adaptiveQuality !== false) {
        if (this.warmupStartElapsed === 0) this.warmupStartElapsed = elapsed;
        const warmedUp = (elapsed - this.warmupStartElapsed) >= this.warmupTime;
        if (warmedUp) {
          const minFps = config.performance?.minTargetFPS || 35;
          const dropThreshold = config.performance?.qualityDropThreshold || 3;
          if (this.fps < minFps) {
            this.lowFpsDuration++;
            if (this.lowFpsDuration >= dropThreshold) {
              this.qualityLevel = Math.max(0.4, this.qualityLevel - 0.1);
              this.applyQualityLevel();
              console.warn('[Engine] FPS过低，降质至:', this.qualityLevel.toFixed(2));
              this.lowFpsDuration = 0;
            }
          } else {
            this.lowFpsDuration = Math.max(0, this.lowFpsDuration - 1);
            if (this.fps > minFps + 10 && this.qualityLevel < 1.0) {
              this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.03);
              this.applyQualityLevel();
            }
          }
        }
      }
    }

    // 暂停时只更新 camera uniform（避免恢复时位置跳变），跳过重计算
    if (this.isPaused) {
      if (this.scene.objects.nebula) this.scene.objects.nebula.update(0, elapsed, this.camera.camera);
      this.postprocessing.render();
      return;
    }

    // 更新系统
    this.player.update(delta);
    this.scene.update(delta, elapsed, this.player.getSpeed(), this.player.getVelocity());
    this.hud.update(delta);

    // 更新 HUD 信息
    this.hud.updateSpeed(this.player.getSpeed());
    this.hud.updatePosition(
      this.camera.camera.position.x,
      this.camera.camera.position.y,
      this.camera.camera.position.z
    );

    // 更新黑洞危险等级
    if (this.scene.objects.blackhole) {
      this.hud.updateDanger(this.scene.objects.blackhole.getDangerLevel());
    }

    // 更新跃迁特效（冲刺时触发）
    this.hud.updateWarpEffect(this.player.getSpeed(), 100);
    this.hud.updateSprint(this.player.isSprinting());

    // 渲染
    this.postprocessing.render();
  }

  /**
   * v8.0: 应用自适应画质等级
   */
  applyQualityLevel() {
    const q = this.qualityLevel;
    if (this.scene && this.scene.objects) {
      // 降低尘埃透明度
      if (this.scene.objects.cosmicDust && this.scene.objects.cosmicDust.material) {
        this.scene.objects.cosmicDust.material.opacity = 0.1 * q;
      }
      // 降低速度线透明度
      if (this.scene.objects.speedLines && this.scene.objects.speedLines.material) {
        this.scene.objects.speedLines.material.opacity = Math.min(
          this.scene.objects.speedLines.material.opacity, q
        );
      }
    }
  }

  /**
   * 销毁引擎
   */
  dispose() {
    this.stop();
    if (this.scene) this.scene.dispose();
    if (this.renderer) this.renderer.dispose();
    if (this.postprocessing) this.postprocessing.dispose();
    if (this.hud) this.hud.dispose();
    if (this.camera) this.camera.dispose();
    if (this.player) this.player.dispose();
  }
}
