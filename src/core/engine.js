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
    // 复用临时向量避免每帧 GC（animate 热路径）
    this._sunPos = new THREE.Vector3();
    this._tmpFwdVel = new THREE.Vector3();
    this._tmpLatVel = new THREE.Vector3();
    // 银河系俯瞰地图模式
    this._isMapMode = false;
    this._mapBlend = 1.0;
    this._mapSavedPos = new THREE.Vector3();
    this._mapSavedQuat = new THREE.Quaternion();
    this._mapFromPos = new THREE.Vector3();
    this._mapFromQuat = new THREE.Quaternion();
    this._mapToPos = new THREE.Vector3();
    this._mapToQuat = new THREE.Quaternion();
    this._mapTempM4 = new THREE.Matrix4();
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
    // 应用默认模式，确保玩家和相机参数一致
    const defaultMode = config.player.defaultMode || 'close';
    this.player.setMode(defaultMode);
    this.camera.applyMode(defaultMode, false);
    // 注入太阳系引用（替代 window.engine 全局耦合）
    this.player.setSolarSystem(this.scene.objects.solarSystem);
    // v25: 注册额外碰撞体（黑洞、脉冲星、系外行星 → 接近自动限速）
    for (const bh of this.scene.objects.blackholes) {
      this.player.addCollidableBody(bh.group, config.blackhole.eventHorizonRadius * 8);
    }
    for (const psr of this.scene.objects.pulsars) {
      this.player.addCollidableBody(psr.group, config.pulsar.radius * 12);
    }
    if (this.scene.objects.planets?.getPlanets) {
      for (const p of this.scene.objects.planets.getPlanets()) {
        this.player.addCollidableBody(p, p.userData?.radius ?? 80);
      }
    }

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
    // 注入 HUD 引用到各对象（替代 window.engine 全局耦合）
    const objs = this.scene.objects;
    if (objs.blackhole) objs.blackhole.setHUD(this.hud);
    if (objs.pulsar) objs.pulsar.setHUD(this.hud);
    if (objs.solarSystem) objs.solarSystem.setHUD(this.hud);
    if (objs.nebula) objs.nebula.setHUD(this.hud);
    if (objs.planets) objs.planets.setHUD(this.hud);

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

    // 锁定/解锁鼠标（地图模式下不锁定，保持鼠标指针可见）
    this.onDocumentClickBound = () => {
      if (this._isMapMode) return;
      if (this.player && this.player.controls && !this.player.controls.isLocked) {
        this.player.requestLock();
      }
    };
    document.addEventListener('click', this.onDocumentClickBound);

    this.onLockBound = () => {
      this.isPaused = false;
      // v-latest: 锁定后同步内部朝向，避免从地图模式返回或初始进入时视角跳变
      if (this.player) this.player.syncOrientation();
      this.hud.showMessage('已锁定鼠标 - WASD移动 Shift冲刺 C下降 空格上升');
    };
    this.player.controls.addEventListener('lock', this.onLockBound);

    this.onUnlockBound = () => {
      this.isPaused = true;
      this.hud.showMessage('点击屏幕继续探索');
    };
    this.player.controls.addEventListener('unlock', this.onUnlockBound);

    // 地图模式下全局滚轮调整高度
    this.onWheelBound = (e) => {
      if (!this._isMapMode) return;
      e.preventDefault();
      const step = 20000;
      const input = document.getElementById('map-height-input');
      if (!input) return;
      const val = parseInt(input.value, 10);
      const min = parseInt(input.min, 10);
      const max = parseInt(input.max, 10);
      input.value = Math.min(max, Math.max(min, val + (e.deltaY > 0 ? step : -step)));
      input.dispatchEvent(new Event('input'));
    };
    window.addEventListener('wheel', this.onWheelBound, { passive: false });

    // v9.5: P键暂停/恢复所有天体运动
    // V键：切换近景/广域第一人称模式
    this.onKeyDownBound = (e) => {
      if (e.code === 'KeyP') {
        this.isMotionFrozen = !this.isMotionFrozen;
        this.hud.showMessage(this.isMotionFrozen ? '⏸ 天体运动已暂停' : '▶ 天体运动已恢复');
      }
      if (e.code === 'KeyM') {
        this._startMapTransition(!this._isMapMode);
      }
      if (e.code === 'KeyV') {
        this._toggleViewMode();
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
   * 动画循环（v19.6: 单帧错误不中断整体运行）
   */
  animate() {
    if (!this.isRunning) return;

    try {
      this._animateFrame();
    } catch (err) {
      console.error('[Engine] 渲染帧错误（已恢复，继续运行）:', err);
    }
  }

  _animateFrame() {
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
    if (this.isPaused && !this._isMapMode && this._mapBlend >= 1.0) {
      if (this.scene.objects.nebula) this.scene.objects.nebula.update(0, elapsed, this.camera.camera);
      this.postprocessing.render(delta);
      return;
    }

    // 地图模式过渡动画：平滑飞向/飞回俯瞰视角
    if (this._mapBlend < 1.0) {
      this._mapBlend = Math.min(1.0, this._mapBlend + delta * 2.5);
      const t = this._mapBlend;
      // easeInOutCubic
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.camera.position.lerpVectors(this._mapFromPos, this._mapToPos, ease);
      this.camera.camera.quaternion.slerpQuaternions(this._mapFromQuat, this._mapToQuat, ease);
      // 过渡完成后恢复鼠标锁定（从地图返回时）
      if (this._mapBlend >= 1.0 && !this._isMapMode) {
        this.isPaused = false;
        setTimeout(() => {
          if (this.player?.controls && !this.player.controls.isLocked) {
            this.player.requestLock();
          }
        }, 150);
      }
      // 过渡期间仍更新场景，维持星空动画
      const zeroVel = this._worldVel ? this._worldVel.set(0, 0, 0) : new THREE.Vector3();
      this.scene.update(this.isMotionFrozen ? 0 : delta, elapsed, 0, zeroVel);
      this.hud.update(delta);
      this.postprocessing.render(delta);
      return;
    }

    // 地图模式渲染（过渡完成后）：场景持续更新，不更新玩家
    if (this._isMapMode) {
      // 更新相机高度（根据滚动条）
      const height = this.hud.getMapHeight();
      this._sunPos.set(0, 0, 0);
      this.scene.galaxyCenterGroup.getWorldPosition(this._sunPos);
      this.camera.camera.position.set(this._sunPos.x, this._sunPos.y + height, this._sunPos.z);
      this._mapTempM4.lookAt(this.camera.camera.position, this._sunPos, new THREE.Vector3(0, 0, -1));
      this.camera.camera.quaternion.setFromRotationMatrix(this._mapTempM4);

      const zeroVel = this._worldVel ? this._worldVel.set(0, 0, 0) : new THREE.Vector3();
      this.scene.update(this.isMotionFrozen ? 0 : delta, elapsed, 0, zeroVel);
      this.hud.update(delta);
      // 地图模式下也要更新 HUD 位置
      this.hud.updatePosition(
        this.camera.camera.position.x,
        this.camera.camera.position.y,
        this.camera.camera.position.z
      );
      this.hud.updateSpeed(0);

      // 更新太阳 HUD 标记位置（橙色）
      const sunWorldPos = new THREE.Vector3();
      this.scene.objects.solarSystem?.sun?.getWorldPosition(sunWorldPos);
      const sunScreenPos = sunWorldPos.clone().project(this.camera.camera);
      const screenX = (sunScreenPos.x + 1) * 0.5 * window.innerWidth;
      const screenY = (-sunScreenPos.y + 1) * 0.5 * window.innerHeight;
      this.hud.updateMapSunMarker(screenX, screenY);

      // 更新玩家当前位置标记（蓝色）
      const playerScreenPos = this._mapSavedPos.clone().project(this.camera.camera);
      const px = (playerScreenPos.x + 1) * 0.5 * window.innerWidth;
      const py = (-playerScreenPos.y + 1) * 0.5 * window.innerHeight;
      this.hud.updateMapPlayerMarker(px, py);

      this.postprocessing.render(delta);
      return;
    }

    // v19.5: 计算世界空间速度 — 相机方向即时响应鼠标，位置差捕捉侧飞
    if (!this._prevCamPos) this._prevCamPos = new THREE.Vector3();
    if (!this._worldVel) this._worldVel = new THREE.Vector3();
    if (!this._camFwd) this._camFwd = new THREE.Vector3();

    // 位置差速度（准确但滞后一帧）
    const deltaVel = this._worldVel.copy(this.camera.camera.position)
      .sub(this._prevCamPos).divideScalar(Math.max(delta, 0.0001));
    this._prevCamPos.copy(this.camera.camera.position);

    const speed = this.player.getSpeed();

    // 相机当前朝向（即时响应鼠标）
    this._camFwd.set(0, 0, -1).applyQuaternion(this.camera.camera.quaternion);

    // 将位置差速度分解为：沿相机朝向分量 + 侧向分量
    const fwdComponent = deltaVel.dot(this._camFwd);
    const fwdVel = this._tmpFwdVel.copy(this._camFwd).multiplyScalar(Math.max(fwdComponent, 0));
    const lateralVel = this._tmpLatVel.copy(deltaVel).sub(fwdVel);

    // 混合：前进方向用相机即时朝向（100%响应鼠标），侧向用位置差（30%平滑）
    this._worldVel.copy(this._camFwd).multiplyScalar(speed > 0.5 ? speed : fwdComponent);
    this._worldVel.addScaledVector(lateralVel, 0.3);

    if (speed < 0.5) this._worldVel.set(0, 0, 0);

    // v-latest: 相机FOV/near/far平滑过渡
    this.camera.update(delta);

    // 更新系统
    this.player.update(delta);
    const currentMaxSpeed = this.player.maxSpeed;
    const currentSprintMultiplier = this.player.sprintMultiplier;
    this.scene.update(
      this.isMotionFrozen ? 0 : delta,
      elapsed,
      speed,
      this._worldVel,
      currentMaxSpeed,
      currentSprintMultiplier
    );
    this.hud.update(delta);

    // 更新 HUD 信息
    this.hud.updateSpeed(this.player.getSpeed());
    this.hud.updatePosition(
      this.camera.camera.position.x,
      this.camera.camera.position.y,
      this.camera.camera.position.z
    );

    // 更新黑洞危险等级（v25: 取最近黑洞的危险等级）
    if (this.scene.objects.blackholes.length > 0) {
      let maxDanger = 0;
      for (const bh of this.scene.objects.blackholes) {
        maxDanger = Math.max(maxDanger, bh.getDangerLevel());
      }
      this.hud.updateDanger(maxDanger);
    }

    // 更新跃迁特效（使用当前模式maxSpeed）
    this.hud.updateWarpEffect(this.player.getSpeed(), currentMaxSpeed);
    this.hud.updateSprint(this.player.isSprinting());

    // v11: 更新天体后处理特效（每帧重置，由各天体自行设置强度）
    const cPass = this.postprocessing.getCelestialPass();
    if (cPass) {
      const u = cPass.uniforms;
      // 黑洞引力透镜（v25: 取最近黑洞的透镜效果）
      if (this.scene.objects.blackholes.length > 0) {
        this.scene.objects.blackholes[0].updatePostEffects(u, this.camera.camera);
      }
      // v25.1: 多脉冲星后处理累加（取最大值合并，避免互相覆盖）
      if (this.scene.objects.pulsars.length > 0) {
        // 先重置脉冲星相关uniform
        const prevNoise = u.uNoiseIntensity.value;
        const prevFlash = u.uFlashIntensity.value;
        const prevCA = u.uChromaticAberration.value;
        u.uNoiseIntensity.value = 0;
        u.uFlashIntensity.value = 0;
        u.uChromaticAberration.value = 0;

        for (const psr of this.scene.objects.pulsars) {
          psr.updatePostEffects(u, this.camera.camera, delta);
        }

        // 确保最终值取累加后的最大值（防止uniform被覆盖回零）
        u.uNoiseIntensity.value = Math.max(prevNoise, u.uNoiseIntensity.value);
        u.uFlashIntensity.value = Math.max(prevFlash, u.uFlashIntensity.value);
        if (u.uChromaticAberration) {
          u.uChromaticAberration.value = Math.max(prevCA, u.uChromaticAberration.value);
        }
      }
      // 星云雾化
      if (this.scene.objects.nebula) {
        this.scene.objects.nebula.updatePostEffects(u, this.camera.camera);
      }
      // v13: 更新星云太阳方向（复用临时向量避免GC）
      if (this.scene.objects.nebula && this.scene.objects.solarSystem?.sun) {
        this._sunPos.set(0, 0, 0);
        this.scene.objects.solarSystem.sun.getWorldPosition(this._sunPos);
        this.scene.objects.nebula.nebulae?.forEach(neb => {
          this._sunPos.sub(neb.position).normalize();
          neb.userData?.material?.uniforms?.uSunDir?.value?.copy(this._sunPos);
        });
      }
    }

    // v10.0: 银河宏观运动 — 太阳系公转 + 较差自转
    const gm = config.galaxyMotion;
    if (gm && gm.enabled !== false && !this.isMotionFrozen) {
      // v26.2: 地图模式下加速银河自转（10×），动态反馈更明显
      const ts = this._isMapMode ? 10.0 : (gm.timeScale || 1);
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

    // 渲染（v25: 传入delta用于自动曝光）
    this.postprocessing.render(delta);
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
      // v26: 低画质削减银河银晕/雾气粒子数
      if (q < 0.7 && this.scene.objects.stars?.hazePoints) {
        const total = this.scene.objects.stars.hazePoints.geometry.attributes.position.count;
        this.scene.objects.stars.hazePoints.geometry.setDrawRange(0, Math.floor(total * 0.5));
      } else if (this.scene.objects.stars?.hazePoints) {
        const total = this.scene.objects.stars.hazePoints.geometry.attributes.position.count;
        this.scene.objects.stars.hazePoints.geometry.setDrawRange(0, total);
      }
      if (q < 0.5 && this.scene.objects.stars?.hazePoints) {
        const total = this.scene.objects.stars.hazePoints.geometry.attributes.position.count;
        this.scene.objects.stars.hazePoints.geometry.setDrawRange(0, Math.floor(total * 0.2));
      }
    }
  }

  /**
   * 切换近景/广域第一人称视角模式
   */
  _toggleViewMode() {
    const currentMode = this.player.getMode();
    const nextMode = currentMode === 'close' ? 'wide' : 'close';

    this.player.setMode(nextMode);
    this.camera.applyMode(nextMode, true);

    const modeName = config.camera.modes?.[nextMode]?.name || nextMode;
    this.hud.showMessage(`视角模式：${modeName}`, 2000);
    this.hud.updateViewMode(nextMode, modeName);

    // 通知场景子系统切换模式（用于小行星场等 LOD/数量调整）
    this.scene.setViewMode(nextMode);
  }

  /**
   * 切换银河系俯瞰地图模式
   * @param {boolean} toMap - true=进入地图, false=返回探索
   */
  _startMapTransition(toMap) {
    // 记录当前相机位置作为动画起点
    this._mapFromPos.copy(this.camera.camera.position);
    this._mapFromQuat.copy(this.camera.camera.quaternion);

    if (toMap) {
      // 保存探索视角，以便后续返回
      this._mapSavedPos.copy(this.camera.camera.position);
      this._mapSavedQuat.copy(this.camera.camera.quaternion);

      // 获取银河中心世界坐标
      this._sunPos.set(0, 0, 0);
      this.scene.galaxyCenterGroup.getWorldPosition(this._sunPos);

      // 获取当前滚动条高度
      this._mapHeight = this.hud.getMapHeight();

      // 相机在银河盘上方，看向银河盘中心（up=(0,0,-1) 让银河盘 X 轴在屏幕左右）
      this._mapToPos.set(this._sunPos.x, this._sunPos.y + this._mapHeight, this._sunPos.z);
      this._mapTempM4.lookAt(this._mapToPos, this._sunPos, new THREE.Vector3(0, 0, -1));
      this._mapToQuat.setFromRotationMatrix(this._mapTempM4);

      // 解锁鼠标（地图模式下不需要飞行控制）
      if (this.player.controls.isLocked) {
        this.player.controls.unlock();
      }
      this.isPaused = true;
      this._isMapMode = true;
      this.hud.showMessage('🗺 银河系俯瞰 · 按 M 返回探索 · 拖动右侧滑块调整高度', 0);
      this.hud.showMapUI(true);
    } else {
      // 隐藏地图 UI
      this.hud.showMapUI(false);

      // 返回保存的探索位置
      this._mapToPos.copy(this._mapSavedPos);
      this._mapToQuat.copy(this._mapSavedQuat);
      this._isMapMode = false;
      this.hud.showMessage('已返回探索视角', 2000);
    }

    this._mapBlend = 0; // 启动过渡动画
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
    window.removeEventListener('wheel', this.onWheelBound);
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
