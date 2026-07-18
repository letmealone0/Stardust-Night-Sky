/**
 * 玩家控制器
 * WASD 移动 + 鼠标视角控制
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { config } from '../core/config.js';

export class PlayerController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.controls = null;

    // 移动状态
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;
    this.sprint = false;

    // 速度向量
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    // v9.0: 惯性飞行配置
    this._baseConfig = config.player;
    this._currentMode = config.player.defaultMode || 'close';
    this._modeConfig = config.player.modes?.[this._currentMode] || config.player;
    this._modeTransition = 1.0; // 初始已完成过渡（跳过插值，避免 undefined 目标值导致 NaN）

    this.accel = this._modeConfig.accel || 200;
    this.decelDamping = this._modeConfig.decelDamping || 0.94;
    this.maxSpeed = this._modeConfig.maxSpeed || 80;
    this.sprintMultiplier = this._modeConfig.sprintMultiplier || 3.0;
    this.sprintFovBoost = this._modeConfig.sprintFovBoost || 25;
    this.baseFov = config.camera.modes?.[this._currentMode]?.fov ?? config.camera.fov;

    this.mouseSensitivity = this._modeConfig.mouseSensitivity ?? config.player.mouseSensitivity ?? 0.002;
    this.lookSmoothTime = this._modeConfig.lookSmoothTime ?? config.player.lookSmoothTime ?? 0.045;
    this.cameraShake = this._modeConfig.cameraShake ?? config.player.cameraShake ?? true;
    this.shakeAmplitude = this._modeConfig.shakeAmplitude ?? config.player.shakeAmplitude ?? 1.5;
    this.shakeFrequency = this._modeConfig.shakeFrequency ?? config.player.shakeFrequency ?? 10.0;

    // 初始化插值目标值（与当前模式一致，防止未调用 setMode 时的 NaN）
    this._targetAccel = this.accel;
    this._targetMaxSpeed = this.maxSpeed;
    this._targetSprintMultiplier = this.sprintMultiplier;
    this._targetSprintFovBoost = this.sprintFovBoost;
    this._targetMouseSensitivity = this.mouseSensitivity;
    this._targetLookSmoothTime = this.lookSmoothTime;
    this._targetShakeAmplitude = this.shakeAmplitude;

    this.sprintFactor = 0;
    this._tmpVec = new THREE.Vector3();
    // v9.0-fix: 镜头抖动偏移量跟踪，防止累加导致位置漂移
    this._shakeOffset = new THREE.Vector3();

    // v-latest: 鼠标视角平滑（解耦输入与渲染，帧率无关阻尼）
    this._mouseDX = 0;            // 本帧累积的鼠标 X 位移
    this._mouseDY = 0;            // 本帧累积的鼠标 Y 位移
    this.yaw = 0;                 // 当前偏航角（已平滑）
    this.pitch = 0;               // 当前俯仰角（已平滑）
    this.targetYaw = 0;           // 目标偏航角（输入直接写入）
    this.targetPitch = 0;         // 目标俯仰角（输入直接写入）
    this._eulerLook = new THREE.Euler(0, 0, 0, 'YXZ'); // 复用，避免每帧 GC
    // 依赖注入：天文对象引用（替代 window.engine 全局耦合）
    this._solarSystem = null;
    this._tempPlanetPos = new THREE.Vector3();
  }

  /**
   * 初始化控制器
   */
  init() {
    this.controls = new PointerLockControls(this.camera, this.domElement);

    // v-latest: 接管鼠标旋转 — 移除 PLC 内置的即时旋转监听，
    // 改为累积增量 + 在渲染循环内平滑应用，避免晃动鼠标时视角突跳
    const doc = this.controls.domElement.ownerDocument;
    doc.removeEventListener('mousemove', this.controls._onMouseMove);
    this._onMouseMoveBound = (e) => this.onMouseMove(e);
    doc.addEventListener('mousemove', this._onMouseMoveBound);

    // 绑定键盘事件
    this.bindKeyboardEvents();

    // PointerLock 中断时重置按键状态并清空速度（防止解锁后继续漂移）
    this.onPointerLockChangeBound = () => {
      if (!this.controls.isLocked) {
        this.resetKeys();
        this.velocity.set(0, 0, 0); // fix: 清空速度向量，防止解锁后玩家持续漂移
        // v25-fix: 同步内部朝向状态到相机当前朝向，防止重新锁定时视角跳变
        this.syncOrientation();
      }
    };
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);

    // 从相机初始朝向同步 yaw/pitch，保证宇宙倾斜度与初始视角不变
    this.syncOrientation();

    console.log('[PlayerController] 控制器初始化完成');
  }

  /**
   * 重置所有按键状态
   */
  resetKeys() {
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;
    this.sprint = false;
  }

  /**
   * v-latest: 鼠标移动处理 — 仅累积增量，不直接旋转相机。
   * 真正的旋转在 update() 内以帧率无关的方式平滑应用，
   * 这样一帧内的多次 mousemove 被合并，快速晃动也不会瞬间跳变。
   */
  onMouseMove(event) {
    if (this.controls.isLocked === false) return;
    this._mouseDX += event.movementX || 0;
    this._mouseDY += event.movementY || 0;
  }

  /**
   * v-latest: 从相机当前四元数同步 yaw/pitch。
   * 在锁定/地图模式返回后调用，使内部状态与外部朝向一致，防止视角跳变。
   */
  syncOrientation() {
    this._eulerLook.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this._eulerLook.y;
    this.pitch = this._eulerLook.x;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this._mouseDX = 0;
    this._mouseDY = 0;
  }

  /**
   * v-latest: 请求指针锁定，优先关闭系统鼠标加速度以获得线性一致的输入。
   * 部分浏览器不支持 unadjustedMovement，捕获 Promise 拒绝后回退到普通锁定。
   */
  requestLock() {
    const unadjusted = config.player.unadjustedMovement !== false;
    let p;
    try {
      p = this.controls.lock(unadjusted);
    } catch (e) {
      try { this.controls.lock(false); } catch (_) {}
      return;
    }
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        try { this.controls.lock(false); } catch (_) {}
      });
    }
  }

  /**
   * 绑定键盘事件
   */
  bindKeyboardEvents() {
    this.onKeyDownBound = (e) => this.onKeyDown(e);
    this.onKeyUpBound = (e) => this.onKeyUp(e);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
  }

  /**
   * 键盘按下
   */
  onKeyDown(event) {
    if (['Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
    }

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'Space':
        this.moveUp = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprint = true;
        break;
      case 'KeyC':
        this.moveDown = true;
        break;
    }
  }

  /**
   * 键盘抬起
   */
  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
      case 'Space':
        this.moveUp = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprint = false;
        break;
      case 'KeyC':
        this.moveDown = false;
        break;
    }
  }

  /**
   * 设置移动模式（近景/广域），动态调整速度与操控参数
   */
  setMode(mode) {
    const modeCfg = config.player.modes?.[mode];
    if (!modeCfg) {
      console.warn('[PlayerController] 未知模式:', mode);
      return;
    }
    if (this._currentMode === mode) return;

    this._currentMode = mode;
    this._modeConfig = modeCfg;
    this._modeTransition = 0;

    // 立即应用目标值，后续 update 会平滑插值
    this._targetAccel = modeCfg.accel;
    this._targetMaxSpeed = modeCfg.maxSpeed;
    this._targetSprintMultiplier = modeCfg.sprintMultiplier;
    this._targetSprintFovBoost = modeCfg.sprintFovBoost;
    this._targetMouseSensitivity = modeCfg.mouseSensitivity ?? config.player.mouseSensitivity ?? 0.002;
    this._targetLookSmoothTime = modeCfg.lookSmoothTime ?? config.player.lookSmoothTime ?? 0.045;
    this._targetShakeAmplitude = modeCfg.shakeAmplitude ?? config.player.shakeAmplitude ?? 1.5;

    // 同步相机基础FOV（玩家 sprint boost 的基准）
    this.baseFov = config.camera.modes?.[mode]?.fov ?? config.camera.fov;

    console.log('[PlayerController] 切换到模式:', mode);
  }

  /**
   * 获取当前模式
   */
  getMode() {
    return this._currentMode;
  }

  /**
   * v9.0: 惯性飞行 — 加速度+阻尼模型
   */
  update(delta) {
    if (!this.controls.isLocked) {
      // 未锁定时清空抖动偏移与鼠标累积，避免恢复后误减/误转
      this._shakeOffset.set(0, 0, 0);
      this._mouseDX = 0;
      this._mouseDY = 0;
      return;
    }

    // v-latest: 模式参数平滑过渡
    if (this._modeTransition < 1.0) {
      this._modeTransition = Math.min(1.0, this._modeTransition + delta * 2.5);
      const t = this._modeTransition;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.accel = THREE.MathUtils.lerp(this.accel, this._targetAccel, ease);
      this.maxSpeed = THREE.MathUtils.lerp(this.maxSpeed, this._targetMaxSpeed, ease);
      this.sprintMultiplier = THREE.MathUtils.lerp(this.sprintMultiplier, this._targetSprintMultiplier, ease);
      this.sprintFovBoost = THREE.MathUtils.lerp(this.sprintFovBoost, this._targetSprintFovBoost, ease);
      this.mouseSensitivity = THREE.MathUtils.lerp(this.mouseSensitivity, this._targetMouseSensitivity, ease);
      this.lookSmoothTime = THREE.MathUtils.lerp(this.lookSmoothTime, this._targetLookSmoothTime, ease);
      this.shakeAmplitude = THREE.MathUtils.lerp(this.shakeAmplitude, this._targetShakeAmplitude, ease);
    }

    // --- v-latest: 平滑鼠标视角（输入与渲染解耦，帧率无关指数阻尼）---
    const sens = this.mouseSensitivity ?? config.player.mouseSensitivity ?? 0.002;
    const pointerSpeed = this.controls.pointerSpeed ?? 1.0;
    if (this._mouseDX !== 0 || this._mouseDY !== 0) {
      this.targetYaw   -= this._mouseDX * sens * pointerSpeed;
      this.targetPitch -= this._mouseDY * sens * pointerSpeed;
      // 俯仰限位（与 PointerLockControls 一致）
      const PI_2 = Math.PI / 2;
      const minP = PI_2 - (this.controls.maxPolarAngle ?? Math.PI);
      const maxP = PI_2 - (this.controls.minPolarAngle ?? 0);
      this.targetPitch = Math.max(minP, Math.min(maxP, this.targetPitch));
      this._mouseDX = 0;
      this._mouseDY = 0;
    }
    // 指数平滑：时间常数 lookSmoothTime，帧率无关
    const smoothT = 1 - Math.exp(-delta / Math.max(this.lookSmoothTime, 1e-4));
    this.yaw   += (this.targetYaw   - this.yaw)   * smoothT;
    this.pitch += (this.targetPitch - this.pitch) * smoothT;
    this._eulerLook.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._eulerLook);
    this.camera.updateMatrix(); // 让本帧移动方向使用最新朝向

    // 移动方向 (归一化)
    this.direction.set(
      Number(this.moveRight) - Number(this.moveLeft),
      Number(this.moveUp) - Number(this.moveDown),
      Number(this.moveForward) - Number(this.moveBackward)
    );
    const hasInput = this.direction.lengthSq() > 0;
    if (hasInput) this.direction.normalize();

    // 冲刺因子平滑
    const sprintTarget = this.sprint ? 1.0 : 0.0;
    const sprintRate = this.sprint ? 6.0 : 3.0;
    this.sprintFactor += (sprintTarget - this.sprintFactor) * Math.min(1, delta * sprintRate);

    // 当前速度上限
    const currentMaxSpeed = this.maxSpeed * (1 + (this.sprintMultiplier - 1) * this.sprintFactor);

    // 加速度: X/Z通过moveRight/moveForward需取反, Y直接加不取反
    if (hasInput) {
      this._tmpVec.set(
        -this.direction.x * this.accel * delta,
         this.direction.y * this.accel * delta,
        -this.direction.z * this.accel * delta
      );
      this.velocity.add(this._tmpVec);
      // 限速
      const vLen = this.velocity.length();
      if (vLen > currentMaxSpeed) {
        this.velocity.multiplyScalar(currentMaxSpeed / vLen);
      }
    } else {
      // 松键: 指数阻尼衰减
      this.velocity.multiplyScalar(this.decelDamping);
      if (this.velocity.lengthSq() < 0.01) this.velocity.set(0, 0, 0);
    }

    // v9.0: 接近行星表面自动限速
    if (config.player.proximitySlowdown !== false) {
      this.applyProximitySlowdown(delta, currentMaxSpeed);
    }

    // 移动相机
    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);
    this.camera.position.y += this.velocity.y * delta;

    // 动态FOV (速度线性映射: 基础FOV + 冲刺增量)
    const speedFraction = Math.min(this.velocity.length() / currentMaxSpeed, 1.0);
    const targetFov = this.baseFov + this.sprintFovBoost * speedFraction;
    const fovDamp = 1 - Math.pow(0.001, delta);
    this.camera.fov += (targetFov - this.camera.fov) * fovDamp;
    this.camera.updateProjectionMatrix();

    // 冲刺镜头抖动（v9.0-fix: 先撤销上一帧抖动偏移，再施加新偏移，防止累加漂移）
    this.camera.position.x -= this._shakeOffset.x;
    this.camera.position.y -= this._shakeOffset.y;
    if (config.player.cameraShake !== false && speedFraction > 0.3) {
      const shakeAmp = (this.shakeAmplitude || 1.5) * speedFraction;
      const shakeFreq = config.player.shakeFrequency || 10.0;
      const t = performance.now() * 0.001;
      this._shakeOffset.set(
        Math.sin(t * shakeFreq) * shakeAmp * delta,
        Math.cos(t * shakeFreq * 1.3) * shakeAmp * delta * 0.7,
        0
      );
      this.camera.position.x += this._shakeOffset.x;
      this.camera.position.y += this._shakeOffset.y;
    } else {
      this._shakeOffset.set(0, 0, 0);
    }
  }

  /** v9.0: 接近天体表面自动限速（v25: 扩展至黑洞、脉冲星、系外行星） */
  applyProximitySlowdown(delta, currentMaxSpeed) {
    let minDistToSurface = Infinity;

    // 太阳系行星
    if (this._solarSystem?.planets) {
      this._solarSystem.planets.forEach(p => {
        p.group.getWorldPosition(this._tempPlanetPos);
        const dist = this.camera.position.distanceTo(this._tempPlanetPos);
        const surfDist = dist - p.data.radius;
        if (surfDist < minDistToSurface) minDistToSurface = surfDist;
      });
    }

    // v25: 额外检测天体
    if (this._extraBodies) {
      for (const body of this._extraBodies) {
        const pos = body.group?.getWorldPosition
          ? body.group.getWorldPosition(this._tempPlanetPos)
          : body.getWorldPosition?.(this._tempPlanetPos);
        if (!pos) continue;
        const dist = this.camera.position.distanceTo(this._tempPlanetPos);
        const surfDist = dist - (body.radius || 20);
        if (surfDist < minDistToSurface) minDistToSurface = surfDist;
      }
    }

    if (minDistToSurface < 500) {
      // 距表面越近限速越严；穿入天体(surfDist<0)时强制极低速，避免"刹不住车"
      const factor = minDistToSurface > 0
        ? Math.max(0.08, minDistToSurface / 500)
        : 0.08;
      const speedLimit = currentMaxSpeed * factor;
      const vLen = this.velocity.length();
      if (vLen > speedLimit) {
        this.velocity.multiplyScalar(speedLimit / vLen);
      }
    }
  }

  /** v25: 注册额外碰撞体（黑洞、脉冲星等） */
  addCollidableBody(group, radius) {
    if (!this._extraBodies) this._extraBodies = [];
    this._extraBodies.push({ group, radius });
  }

  /**
   * 设置太阳系引用（用于接近限速检测，替代 window.engine 全局耦合）
   */
  setSolarSystem(solarSystem) {
    this._solarSystem = solarSystem;
  }

  /**
   * 获取移动速度（用于 HUD 显示）
   */
  getSpeed() {
    return this.velocity.length();
  }

  /**
   * 获取速度向量（用于方向感知效果）
   * 返回相机空间的速度方向
   */
  getVelocity() {
    return this.velocity;
  }

  /**
   * 重置到起始位置（R 键回家功能）
   */
  resetToStart() {
    if (!this.camera) return;
    const start = config.camera.startPosition;
    this.camera.position.set(start.x, start.y, start.z);
    this.velocity.set(0, 0, 0);
    this._shakeOffset.set(0, 0, 0);
    // 同步内部朝向到当前相机朝向（保持视角方向不跳变）
    this.syncOrientation();
  }

  /**
   * 获取平滑冲刺因子 (0~1)
   */
  getSprintFactor() {
    return this.sprintFactor;
  }

  /**
   * 是否在冲刺
   */
  isSprinting() {
    return this.sprint;
  }

  /**
   * 销毁控制器
   */
  dispose() {
    // 移除事件监听（防止重建时残留与内存泄漏）
    if (this._onMouseMoveBound) {
      const doc = this.controls?.domElement?.ownerDocument;
      if (doc) doc.removeEventListener('mousemove', this._onMouseMoveBound);
    }
    if (this.onKeyDownBound) window.removeEventListener('keydown', this.onKeyDownBound);
    if (this.onKeyUpBound) window.removeEventListener('keyup', this.onKeyUpBound);
    if (this.onPointerLockChangeBound) document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    if (this.controls) this.controls.dispose();
  }
}
