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
import { TrackingController } from '../controls/tracking.js';

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
    this._prevCamPos = new THREE.Vector3();
    this._worldVel = new THREE.Vector3();  // v29-fix: 构造函数初始化，避免热路径 GC
    this._camFwd = new THREE.Vector3();
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
    this._trackingJustExited = false;  // v29-fix: 跟踪退出后短暂忽略 unlock
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

    // v30: 初始视角对准太阳系（必须在 player 与 mode 全部就绪后执行）
    this._lookAtSolarSystem();
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

    // 创建跟踪视角控制器
    this.tracking = new TrackingController(this.camera.camera, this.renderer.renderer.domElement);
    this.tracking.init();
    this.tracking.setTargets(this._collectTrackTargets());
    this.tracking.setOnExit(() => this._onTrackingExit());
    this.hud.setTrackingTargets(this.tracking.getTargets());
    this.hud.setOnTrackSelect((i) => this._enterTracking(i));
    this.hud.setOnMenuClose(() => this._closeTrackingMenu());

    // 绑定事件
    this.bindEvents();

    console.log('[Engine] 初始化完成');
  }

  /**
   * 将相机初始视角对准太阳系（直接计算 yaw/pitch，绕过 lookAt 与 euler 空间差异）
   */
  _lookAtSolarSystem() {
    if (!this.scene?.objects?.solarSystem || !this.camera?.camera || !this.player) return;
    const solarPos = new THREE.Vector3();
    this.scene.objects.solarSystem.group.getWorldPosition(solarPos);
    const camPos = this.camera.camera.position;

    // 从相机到太阳系的世界方向
    const dir = new THREE.Vector3().subVectors(solarPos, camPos);
    const len = dir.length();
    if (len < 0.001) return;

    // YXZ 欧拉顺序：-Z 为前方向，yaw 绕 Y 轴，pitch 绕 X 轴
    const yaw = Math.atan2(dir.x, -dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y / len)));

    // 更新玩家控制器的内部朝向（避免下一帧被 syncOrientation 覆写）
    this.player.yaw = yaw;
    this.player.pitch = pitch;
    this.player.targetYaw = yaw;
    this.player.targetPitch = pitch;

    // 直接设置相机四元数，保证本帧渲染使用正确朝向
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    this.camera.camera.quaternion.setFromEuler(euler);

    console.log('[Engine] 初始视角已对准太阳系  yaw:', yaw.toFixed(3), 'pitch:', pitch.toFixed(3));
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
      console.warn('[Config] planets.count 必须 > 0，已重置为 4');
      planets.count = 4;
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
      // 跟踪模式或菜单打开时不锁定鼠标（OrbitControls/菜单需要自由鼠标）
      if (this.tracking?.isActive() || this.hud?.isMenuOpen()) return;
      if (this.player && this.player.controls && !this.player.controls.isLocked) {
        this.player.requestLock();
      }
    };
    document.addEventListener('click', this.onDocumentClickBound);

    this.onLockBound = () => {
      this.isPaused = false;
      this._trackingJustExited = false;  // v29-fix: 锁定成功，清除保护标志
      // v-latest: 锁定后同步内部朝向，避免从地图模式返回或初始进入时视角跳变
      if (this.player) this.player.syncOrientation();
      this.hud.showMessage('已锁定 · W指哪飞哪 · Space上升 C下降 · Shift冲刺');
    };
    this.player.controls.addEventListener('lock', this.onLockBound);

    this.onUnlockBound = () => {
      // v29-fix: 跟踪刚退出时忽略 unlock 事件，防止 isPaused 被误设回 true
      if (this._trackingJustExited) return;
      // 跟踪模式或菜单打开时，解锁鼠标不暂停（场景继续更新）
      if (this.tracking?.isActive() || this.hud?.isMenuOpen()) return;
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
      if (e.code === 'KeyR' && !this._isMapMode && !this.tracking?.isActive() && this.player) {
        this.player.resetToStart();
        this.hud.showMessage('已返回起始位置', 2000);
      }
      if (e.code === 'KeyT' && !this._isMapMode) {
        this._toggleTrackingMenu();
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.tracking?.isActive()) {
          this.tracking.nextTarget(e.shiftKey ? -1 : 1);
          this.hud.updateTrackingStatus(this.tracking.getCurrentName());
        }
      }
      if (e.code === 'Escape') {
        if (this.hud?.isMenuOpen()) {
          this._closeTrackingMenu();
        } else if (this.tracking?.isActive()) {
          this.tracking.exit();
        }
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

    // v29-fix: 跟踪视角优先于暂停 — 确保暂停状态下也能进入/退出跟踪
    // 跟踪视角模式：由 TrackingController 接管相机，跳过第一人称逻辑
    if (this.tracking?.isActive()) {
      const zeroVel = this._worldVel ? this._worldVel.set(0, 0, 0) : new THREE.Vector3();
      this.scene.update(this.isMotionFrozen ? 0 : delta, elapsed, 0, zeroVel);
      this.tracking.update(delta);
      this.camera.update(delta);
      this.hud.update(delta);
      this.hud.updatePosition(
        this.camera.camera.position.x,
        this.camera.camera.position.y,
        this.camera.camera.position.z
      );
      this.hud.updateSpeed(0);
      if (this.scene.objects.blackholes.length > 0) {
        let maxDanger = 0;
        for (const bh of this.scene.objects.blackholes) maxDanger = Math.max(maxDanger, bh.getDangerLevel());
        this.hud.updateDanger(maxDanger);
      }
      this._applyCelestialPostEffects(delta);
      const gm = config.galaxyMotion;
      if (gm && gm.enabled !== false && !this.isMotionFrozen) {
        const ts = gm.timeScale || 1;
        if (this.scene.solarOrbitNode) this.scene.solarOrbitNode.rotation.y += (gm.solarOrbitSpeed || 0.0015) * delta * ts;
        const gmMat = this.scene.objects.stars?.galaxyMaterial;
        if (gmMat?.uniforms) {
          gmMat.uniforms.uTimeScale.value = ts;
          gmMat.uniforms.uCoreRotSpeed.value = gm.coreRotSpeed || 0.008;
          gmMat.uniforms.uRadiusFalloff.value = gm.radiusFalloff || 0.00004;
        }
      }
      this.postprocessing.render(delta);
      return;
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
      // v29-fix: 太阳在相机后方时隐藏标记
      this.hud.setMapSunVisible(sunScreenPos.z <= 1.0 && sunScreenPos.z >= 0.0);
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

    // v29-fix: 计算世界空间速度（_prevCamPos/_worldVel/_camFwd 已在 constructor 初始化）
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

    // v29-fix: 冻结时表现层速度归零，速度线/粒子流/跃迁特效淡出隐去
    const effectiveSpeed = this.isMotionFrozen ? 0 : speed;
    const effectiveVelocity = this.isMotionFrozen ? null : this._worldVel;

    // 更新系统
    this.player.update(delta);
    const currentMaxSpeed = this.player.maxSpeed;
    const currentSprintMultiplier = this.player.sprintMultiplier;
    this.scene.update(
      this.isMotionFrozen ? 0 : delta,
      elapsed,
      effectiveSpeed,
      effectiveVelocity,
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

    // v29-fix: 冻结时跃迁白光、冲刺指示强制关闭
    this.hud.updateWarpEffect(effectiveSpeed, currentMaxSpeed);
    this.hud.updateSprint(this.isMotionFrozen ? false : this.player.isSprinting());

    // v11: 更新天体后处理特效（提取为方法，第一人称/跟踪共用）
    this._applyCelestialPostEffects(delta);

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
    // v29: 三档循环 — wide → close → orbit → wide
    let nextMode;
    if (currentMode === 'wide') nextMode = 'close';
    else if (currentMode === 'close') nextMode = 'orbit';
    else nextMode = 'wide';

    this.player.setMode(nextMode);
    this.camera.applyMode(nextMode, true);

    const modeName = config.camera.modes?.[nextMode]?.name || nextMode;
    this.hud.showMessage(`视角模式：${modeName}`, 2000);
    this.hud.updateViewMode(nextMode, modeName);

    // v29: 切入低轨模式时自动部署到最近天体表面
    if (nextMode === 'orbit') this._deployToClosestOrbit();

    this.scene.setViewMode(nextMode);
  }

  /** v29: 搜索全宇宙最近天体，将玩家无缝部署到其低轨临界高度 */
  _deployToClosestOrbit() {
    const objs = this.scene.objects;
    const playerPos = this.camera.camera.position;
    const bodyPos = new THREE.Vector3();
    let closest = null;
    let closestDist = Infinity;

    // 1. 收集所有带世界坐标的天体候选
    const candidates = [];
    if (objs.solarSystem?.sun) {
      candidates.push({ mesh: objs.solarSystem.sun, radius: config.solarSystem.sunRadius || 120, name: '太阳' });
    }
    if (objs.solarSystem?.planets) {
      objs.solarSystem.planets.forEach(p => {
        candidates.push({ mesh: p.group, radius: p.data.radius, name: p.data.name });
      });
    }
    objs.blackholes.forEach((bh, i) => {
      candidates.push({ mesh: bh.group, radius: config.blackhole.accretionOuterRadius || 200, name: `黑洞 ${i + 1}` });
    });
    objs.pulsars.forEach((psr, i) => {
      candidates.push({ mesh: psr.group, radius: (config.pulsar.radius || 8) * 3, name: `脉冲星 ${i + 1}` });
    });
    if (objs.planets?.getPlanets) {
      objs.planets.getPlanets().forEach((p, i) => {
        candidates.push({ mesh: p, radius: p.userData?.radius || 50, name: `系外行星 ${i + 1}` });
      });
    }

    if (candidates.length === 0) return;

    // 2. 找最近的天体
    candidates.forEach(c => {
      c.mesh.getWorldPosition(bodyPos);
      const d = playerPos.distanceTo(bodyPos);
      if (d < closestDist) { closestDist = d; closest = c; }
    });

    // 3. 部署到低轨临界高度（表面 + 3 单位，留呼吸空间避免 near clip）
    if (closest) {
      closest.mesh.getWorldPosition(bodyPos);
      const dir = new THREE.Vector3().subVectors(playerPos, bodyPos).normalize();
      if (dir.lengthSq() < 0.1) dir.set(0, 1, 0);

      const deployDist = closest.radius + 3;
      this.camera.camera.position.copy(bodyPos).addScaledVector(dir, deployDist);
      this.camera.camera.lookAt(bodyPos);
      this.player.syncOrientation();

      this.hud.showMessage(`低轨环绕：${closest.name}`, 4000);
    }
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

  // ==================== 跟踪视角 ====================

  /** 收集所有可跟踪天体 */
  _collectTrackTargets() {
    const targets = [];
    const objs = this.scene.objects;

    // 太阳
    if (objs.solarSystem?.sun) {
      targets.push({
        name: '太阳', type: 'star',
        getWorldPos: (v) => objs.solarSystem.sun.getWorldPosition(v),
        radius: config.solarSystem.sunRadius || 120,
      });
    }
    // 8 大行星 + 卫星
    if (objs.solarSystem?.planets) {
      objs.solarSystem.planets.forEach(p => {
        targets.push({
          name: p.data.name, type: 'planet',
          getWorldPos: (v) => p.group.getWorldPosition(v),
          getVelocityDir: (v) => {
            // 轨道切线方向（运动方向）：rad × yAxis（绕 Y 正转的切线）
            const pivotPos = new THREE.Vector3();
            p.orbitPivot.getWorldPosition(pivotPos);
            const planetPos = new THREE.Vector3();
            p.group.getWorldPosition(planetPos);
            const rad = new THREE.Vector3().subVectors(planetPos, pivotPos);
            const q = new THREE.Quaternion();
            p.orbitPivot.getWorldQuaternion(q);
            const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
            return v.copy(rad).cross(yAxis).normalize();
          },
          radius: p.data.radius,
        });
        // 不跟踪卫星：太小且绕行星快速运动，Tab 切换时视觉混乱
      });
    }
    // 彗星
    if (objs.comets?.comets) {
      objs.comets.comets.forEach(c => {
        targets.push({
          name: c.data.nameCN || c.data.name, type: 'comet',
          getWorldPos: (v) => c.group.getWorldPosition(v),
          radius: c.data.comaRadius || 20,
        });
      });
    }
    // 黑洞
    objs.blackholes.forEach((bh, i) => {
      targets.push({
        name: `黑洞 ${i + 1}`, type: 'blackhole',
        getWorldPos: (v) => bh.group.getWorldPosition(v),
        radius: config.blackhole.accretionOuterRadius || 200,
      });
    });
    // 脉冲星
    objs.pulsars.forEach((psr, i) => {
      targets.push({
        name: `脉冲星 ${i + 1}`, type: 'pulsar',
        getWorldPos: (v) => psr.group.getWorldPosition(v),
        radius: config.pulsar.radius * 5 || 25,
      });
    });
    // 随机系外行星
    if (objs.planets?.getPlanets) {
      objs.planets.getPlanets().forEach((p, i) => {
        targets.push({
          name: `系外行星 ${i + 1}`, type: 'exoplanet',
          getWorldPos: (v) => p.getWorldPosition(v),
          radius: p.userData?.radius || 50,
        });
      });
    }
    return targets;
  }

  _enterTracking(index) {
    if (!this.tracking) return;
    // 解锁鼠标（OrbitControls 需要自由鼠标）
    if (this.player.controls.isLocked) {
      this.player.controls.unlock();
    }
    this.tracking.enter(index);
    this.hud.hideTrackingMenu();
    this.hud.updateTrackingStatus(this.tracking.getCurrentName());
    this.hud.showMessage(`跟踪：${this.tracking.getCurrentName()}`, 2000);
  }

  _toggleTrackingMenu() {
    if (this.hud.isMenuOpen()) {
      this._closeTrackingMenu();
    } else {
      if (this.player.controls.isLocked) {
        this.player.controls.unlock();
      }
      this.hud.showTrackingMenu();
    }
  }

  _closeTrackingMenu() {
    this.hud.hideTrackingMenu();
    if (!this.tracking?.isActive()) {
      this.isPaused = false;
      this._trackingJustExited = true;  // v29-fix: 阻止 onUnlockBound 把 isPaused 设回 true
      this.hud.showMessage('点击屏幕继续探索');
      setTimeout(() => { this._trackingJustExited = false; }, 1000);
    }
  }

  _onTrackingExit() {
    this.hud.updateTrackingStatus(null);
    this.isPaused = false;
    this._trackingJustExited = true;  // v29-fix: 阻止 onUnlockBound 把 isPaused 设回 true
    this.hud.showMessage('点击屏幕继续探索');
    // v29-fix: 1秒后自动清除标志（即使不点击也不会永久锁死）
    setTimeout(() => { this._trackingJustExited = false; }, 1000);
  }

  /** 天体后处理特效（黑洞引力透镜 + 脉冲星 + 星云）— 第一人称/跟踪共用 */
  _applyCelestialPostEffects(delta) {
    const cPass = this.postprocessing.getCelestialPass();
    if (!cPass) return;
    const u = cPass.uniforms;
    // 黑洞引力透镜（对 dangerLevel 最大的黑洞生效）
    let activeBH = null;
    let maxDanger = 0;
    for (const bh of this.scene.objects.blackholes) {
      const d = bh.getDangerLevel();
      if (d > maxDanger) { maxDanger = d; activeBH = bh; }
    }
    if (activeBH) {
      activeBH.updatePostEffects(u, this.camera.camera);
    } else if (this.scene.objects.blackholes.length > 0) {
      let nearest = this.scene.objects.blackholes[0];
      let nd = nearest.group.position.distanceTo(this.camera.camera.position);
      for (const bh of this.scene.objects.blackholes) {
        const d = bh.group.position.distanceTo(this.camera.camera.position);
        if (d < nd) { nd = d; nearest = bh; }
      }
      nearest.updatePostEffects(u, this.camera.camera);
    }
    // 脉冲星后处理（累加取最大）
    if (this.scene.objects.pulsars.length > 0) {
      const prevNoise = u.uNoiseIntensity.value;
      const prevFlash = u.uFlashIntensity.value;
      const prevCA = u.uChromaticAberration.value;
      u.uNoiseIntensity.value = 0;
      u.uFlashIntensity.value = 0;
      u.uChromaticAberration.value = 0;
      for (const psr of this.scene.objects.pulsars) {
        psr.updatePostEffects(u, this.camera.camera, delta);
      }
      // v29-fix: NaN/Infinity 防护 — 任何 uniform 出现非有限值都强制归零（Math.max(NaN, x) = NaN 永远不恢复）
      const nVal = u.uNoiseIntensity.value;
      const fVal = u.uFlashIntensity.value;
      const caVal = u.uChromaticAberration.value;
      u.uNoiseIntensity.value = isFinite(nVal) ? Math.min(Math.max(prevNoise, nVal), 1.0) : 0;
      u.uFlashIntensity.value = isFinite(fVal) ? Math.min(Math.max(prevFlash, fVal), 1.0) : 0;
      if (u.uChromaticAberration) {
        u.uChromaticAberration.value = isFinite(caVal) ? Math.min(Math.max(prevCA, caVal), 0.2) : 0;
      }
    }
    // 星云雾化
    if (this.scene.objects.nebula) {
      this.scene.objects.nebula.updatePostEffects(u, this.camera.camera);
    }
    // 星云太阳方向
    if (this.scene.objects.nebula && this.scene.objects.solarSystem?.sun) {
      this._sunPos.set(0, 0, 0);
      this.scene.objects.solarSystem.sun.getWorldPosition(this._sunPos);
      this.scene.objects.nebula.nebulae?.forEach(neb => {
        this._sunPos.sub(neb.position).normalize();
        neb.userData?.material?.uniforms?.uSunDir?.value?.copy(this._sunPos);
      });
    }

    // v29: Gargantua 黑洞光线追踪
    this._updateBhRaytrace();
  }

  /**
   * v29: 更新黑洞光线追踪 ShaderPass uniforms
   */
  _updateBhRaytrace() {
    const bhPass = this.postprocessing.getBhRayPass();
    if (!bhPass) return;
    const cfg = config.blackhole.raytrace;
    if (!cfg.enabled) { bhPass.uniforms.uEnabled.value = 0; return; }

    // 找到最近的（或 dangerLevel 最高的）黑洞
    const bhs = this.scene.objects.blackholes;
    if (bhs.length === 0) { bhPass.uniforms.uEnabled.value = 0; return; }

    let targetBH = bhs[0];
    let minDist = Infinity;
    for (const bh of bhs) {
      const wp = new THREE.Vector3();
      bh.group.getWorldPosition(wp);
      const dist = this.camera.camera.position.distanceTo(wp);
      if (dist < minDist) { minDist = dist; targetBH = bh; }
    }

    // v29: 大范围启用（50000），屏幕空间混合自动处理远近
    const enableDist = cfg.enableDistance;
    const enabled = minDist < enableDist ? 1.0 : 0.0;
    bhPass.uniforms.uEnabled.value = enabled;
    if (enabled < 0.5) return;

    const u = bhPass.uniforms;
    const cam = this.camera.camera;

    // 黑洞世界坐标
    const bhWorldPos = new THREE.Vector3();
    targetBH.group.getWorldPosition(bhWorldPos);
    u.uBHWorldPos.value.copy(bhWorldPos);

    // v29-fix: 投影到屏幕空间 + NaN 防御（矩阵未初始化时 project 可能返回 NaN）
    const bhScreen = new THREE.Vector3().copy(bhWorldPos).project(cam);
    if (isNaN(bhScreen.x) || isNaN(bhScreen.y) || isNaN(bhScreen.z)) {
      u.uBHScreenPos.value.set(-999.0, -999.0);
      u.uEnabled.value = 0.0; // 强制关闭 raytrace，避免 shader 全屏 NaN
      return;
    }

    u.uInvScale.value = 1.0 / config.blackhole.eventHorizonRadius;

    // v29-fix: 盘面世界空间基底（把世界射线变换到盘局部空间，盘面在 y=0）
    if (targetBH._diskContainer) {
      targetBH._diskContainer.updateMatrixWorld(true); // 确保矩阵最新，避免滞后抖动
      const me = targetBH._diskContainer.matrixWorld.elements;
      const e0 = new THREE.Vector3(me[0], me[1], me[2]);  // 局部 X → 世界
      const e1 = new THREE.Vector3(me[4], me[5], me[6]);  // 局部 Y → 世界 (盘面法线)
      const e2 = new THREE.Vector3(me[8], me[9], me[10]); // 局部 Z → 世界
      u.uDiskRot0.value.copy(e0);
      u.uDiskRot1.value.copy(e1);
      u.uDiskRot2.value.copy(e2);
    }

    // 相机参数
    u.uCamPos.value.copy(cam.position);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    u.uCamDir.value.copy(dir);

    // v29-fix: 检查黑洞是否在相机后方（点积 < 0，比 NDC z 更可靠）
    const camToBH = new THREE.Vector3().subVectors(bhWorldPos, cam.position);
    if (camToBH.dot(dir) < 0.0) {
      u.uBHScreenPos.value.set(-999.0, -999.0);
    } else {
      u.uBHScreenPos.value.set(
        (bhScreen.x + 1.0) * 0.5,
        (bhScreen.y + 1.0) * 0.5
      );
    }

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const camUp = new THREE.Vector3().crossVectors(right, dir).normalize();
    u.uCamUp.value.copy(camUp);
    u.uCamRight.value.copy(right);
    u.uAspect.value = cam.aspect;
    u.uFovScale.value = Math.tan((cam.fov * Math.PI / 180) * 0.5);

    // 参数同步
    u.uTime.value = performance.now() * 0.001;
    u.uSteps.value = cfg.steps;
    u.uDin.value = cfg.diskInner;
    u.uDout.value = cfg.diskOuter;
    u.uDopMax.value = cfg.dopplerMax;
    u.uOpNear.value = cfg.opacityNear;
    u.uOpFar.value = cfg.opacityFar;
    u.uDiskBright.value = cfg.diskBrightness;
    u.uStarBright.value = cfg.starBrightness;
    u.uSkyFloor.value = cfg.skyFloor;
    u.uRotSpeed.value = cfg.rotSpeed;
    u.uSizeScale.value = cfg.sizeScale || 3.0;
    u.uDebug.value = cfg.debug;
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
    if (this.tracking) this.tracking.dispose();
    if (this.camera) this.camera.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}
