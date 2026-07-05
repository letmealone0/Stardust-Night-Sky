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
    // v9.5: 暂停所有天体运动
    this.isMotionFrozen = false;
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
    if (!player.maxSpeed || player.maxSpeed <= 0) {
      console.warn('[Config] maxSpeed 必须 > 0，已重置为 80');
      player.maxSpeed = 80;
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
    this._resizeTimeout = null;
    this.onResizeBound = () => {
      if (this._resizeTimeout) return;
      this._resizeTimeout = requestAnimationFrame(() => {
        this.onResize();
        this._resizeTimeout = null;
      });
    };
    window.addEventListener('resize', this.onResizeBound);

    // 锁定/解锁鼠标
    this.onDocumentClickBound = () => {
      if (this.player && this.player.controls && !this.player.controls.isLocked) {
        this.player.controls.lock();
      }
    };
    document.addEventListener('click', this.onDocumentClickBound);

    this.onLockBound = () => {
      this.isPaused = false;
      this.hud.showMessage('已锁定鼠标 - WASD移动 Shift冲刺 C下降 空格上升');
    };
    this.player.controls.addEventListener('lock', this.onLockBound);

    this.onUnlockBound = () => {
      this.isPaused = true;
      this.hud.showMessage('点击屏幕继续探索');
    };
    this.player.controls.addEventListener('unlock', this.onUnlockBound);

    // v9.5: P键暂停/恢复所有天体运动
    this.onKeyDownBound = (e) => {
      if (e.code === 'KeyP') {
        this.isMotionFrozen = !this.isMotionFrozen;
        this.hud.showMessage(this.isMotionFrozen ? '⏸ 天体运动已暂停' : '▶ 天体运动已恢复');
      }
    };
    window.addEventListener('keydown', this.onKeyDownBound);
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

    // 更新系统 (v9.5: P键仅冻结天体, 玩家仍可自由移动)
    this.player.update(delta);
    this.scene.update(
      this.isMotionFrozen ? 0 : delta,
      elapsed,
      this.player.getSpeed(),
      this.player.getVelocity()
    );
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

    // v11: 更新天体后处理特效（每帧重置，由各天体自行设置强度）
    const cPass = this.postprocessing.getCelestialPass();
    if (cPass) {
      const u = cPass.uniforms;
      // 黑洞引力透镜
      if (this.scene.objects.blackhole) {
        this.scene.objects.blackhole.updatePostEffects(u, this.camera.camera);
      }
      // 脉冲星闪光+噪点
      if (this.scene.objects.pulsar) {
        this.scene.objects.pulsar.updatePostEffects(u, this.camera.camera, delta);
      }
      // 星云雾化
      if (this.scene.objects.nebula) {
        this.scene.objects.nebula.updatePostEffects(u, this.camera.camera);
      }
      // v13: 更新星云太阳方向
      if (this.scene.objects.nebula) {
        const sunPos = this.scene.objects.solarSystem?.sun?.getWorldPosition(new THREE.Vector3());
        if (sunPos) {
          this.scene.objects.nebula.nebulae?.forEach(neb => {
            const sunDir = sunPos.clone().sub(neb.position).normalize();
            neb.userData?.material?.uniforms?.uSunDir?.value?.copy(sunDir);
          });
        }
      }
    }

    // v10.0: 银河宏观运动 — 太阳系公转 + 较差自转
    const gm = config.galaxyMotion;
    if (gm && gm.enabled !== false && !this.isMotionFrozen) {
      const ts = gm.timeScale || 1;
      // 太阳系绕银心公转
      if (this.scene.solarOrbitNode) {
        this.scene.solarOrbitNode.rotation.y += (gm.solarOrbitSpeed || 0.0015) * delta * ts;
      }
      // 银河Shader参数
      const gmMat = this.scene.objects.stars?.galaxyMaterial;
      if (gmMat && gmMat.uniforms) {
        gmMat.uniforms.uTimeScale.value = ts;
        gmMat.uniforms.uCoreRotSpeed.value = gm.coreRotSpeed || 0.008;
        gmMat.uniforms.uRadiusFalloff.value = gm.radiusFalloff || 0.00004;
      }
    }

    // v13: 运动模糊更新
    this.postprocessing.updateMotionBlur(this.camera.camera, delta);

    // 渲染
    this.postprocessing.render();
  }

  /**
   * v8.0: 应用自适应画质等级
   */
  applyQualityLevel() {
    const q = this.qualityLevel;
    if (this.scene && this.scene.objects) {
      // v11: 降低尘埃透明度（新版三层结构）
      const dust = this.scene.objects.cosmicDust;
      if (dust && dust.layers) {
        dust.layers.forEach(l => {
          if (l.material?.uniforms?.uBaseOpacity) {
            l.material.uniforms.uBaseOpacity.value = (l.layerCfg?.opacity || 0.15) * q;
          }
        });
      }
      // 降低速度线透明度
      if (this.scene.objects.speedLines && this.scene.objects.speedLines.material) {
        this.scene.objects.speedLines.material.opacity = Math.min(
          this.scene.objects.speedLines.material.opacity, q
        );
      }
      // v13: 低画质关闭DOF和运动模糊
      const cPass = this.postprocessing?.getCelestialPass();
      if (cPass) {
        if (q < 0.6) cPass.uniforms.uMotionBlurIntensity.value = 0;
        if (q < 0.5) cPass.uniforms.uChromaticAberration.value = 0;
      }
    }
  }

  /**
   * 销毁引擎
   */
  dispose() {
    this.stop();

    // 移除事件监听（防止重建时残留与内存泄漏）
    window.removeEventListener('resize', this.onResizeBound);
    document.removeEventListener('click', this.onDocumentClickBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    if (this.player && this.player.controls) {
      this.player.controls.removeEventListener('lock', this.onLockBound);
      this.player.controls.removeEventListener('unlock', this.onUnlockBound);
    }

    // 销毁子系统（postprocessing 依赖 renderer 上下文，需先于 renderer 销毁）
    if (this.scene) this.scene.dispose();
    if (this.postprocessing) this.postprocessing.dispose();
    if (this.hud) this.hud.dispose();
    if (this.player) this.player.dispose();
    if (this.camera) this.camera.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}
