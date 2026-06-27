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
    this.accel = config.player.accel || 200;
    this.decelDamping = config.player.decelDamping || 0.94;
    this.maxSpeed = config.player.maxSpeed || 80;
    this.sprintMultiplier = config.player.sprintMultiplier || 3.0;
    this.sprintFovBoost = config.player.sprintFovBoost || 25;
    this.baseFov = config.camera.fov;

    this.sprintFactor = 0;
    this._tmpVec = new THREE.Vector3();
  }

  /**
   * 初始化控制器
   */
  init() {
    this.controls = new PointerLockControls(this.camera, this.domElement);

    // 绑定键盘事件
    this.bindKeyboardEvents();

    // PointerLock 中断时重置按键状态（防止 Alt+Tab 后按键卡住）
    document.addEventListener('pointerlockchange', () => {
      if (!this.controls.isLocked) {
        this.resetKeys();
      }
    });

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
   * 绑定键盘事件
   */
  bindKeyboardEvents() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
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
   * v9.0: 惯性飞行 — 加速度+阻尼模型
   */
  update(delta) {
    if (!this.controls.isLocked) return;

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

    // 动态FOV (速度线性映射: 75→100)
    const speedFraction = Math.min(this.velocity.length() / currentMaxSpeed, 1.0);
    const targetFov = this.baseFov + this.sprintFovBoost * speedFraction;
    const fovDamp = 1 - Math.pow(0.001, delta);
    this.camera.fov += (targetFov - this.camera.fov) * fovDamp;
    this.camera.updateProjectionMatrix();

    // 冲刺镜头抖动
    if (config.player.cameraShake !== false && speedFraction > 0.3) {
      const shakeAmp = (config.player.shakeAmplitude || 1.5) * speedFraction;
      const shakeFreq = config.player.shakeFrequency || 10.0;
      const t = performance.now() * 0.001;
      this.camera.position.x += Math.sin(t * shakeFreq) * shakeAmp * delta;
      this.camera.position.y += Math.cos(t * shakeFreq * 1.3) * shakeAmp * delta * 0.7;
    }
  }

  /** v9.0: 接近行星表面自动限速 */
  applyProximitySlowdown(delta, currentMaxSpeed) {
    // 从引擎获取行星位置（通过domElement上的引用）
    const engine = window.engine;
    if (!engine || !engine.scene || !engine.scene.objects.solarSystem) return;
    const planets = engine.scene.objects.solarSystem.planets;
    if (!planets) return;

    let minDistToSurface = Infinity;
    planets.forEach(p => {
      const planetWorldPos = new THREE.Vector3();
      p.group.getWorldPosition(planetWorldPos);
      const dist = this.camera.position.distanceTo(planetWorldPos);
      const surfDist = dist - p.data.radius;
      if (surfDist < minDistToSurface) minDistToSurface = surfDist;
    });

    if (minDistToSurface < 500 && minDistToSurface > 0) {
      const factor = Math.max(0.1, minDistToSurface / 500);
      const speedLimit = currentMaxSpeed * factor;
      const vLen = this.velocity.length();
      if (vLen > speedLimit) {
        this.velocity.multiplyScalar(speedLimit / vLen);
      }
    }
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
    this.controls.dispose();
  }
}
