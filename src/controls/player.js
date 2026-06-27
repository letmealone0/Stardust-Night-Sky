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

    // 配置
    this.moveSpeed = config.player.moveSpeed;
    this.sprintMultiplier = config.player.sprintMultiplier;
    this.sprintFovBoost = config.player.sprintFovBoost || 15;
    this.damping = config.player.damping;
    this.baseFov = config.camera.fov;

    // 冲刺状态（用于平滑过渡）
    this.sprintFactor = 0; // 0=正常, 1=完全冲刺
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
   * 更新玩家位置
   */
  update(delta) {
    if (!this.controls.isLocked) return;

    // 计算移动方向
    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.y = Number(this.moveUp) - Number(this.moveDown);
    if (this.direction.lengthSq() > 0) this.direction.normalize();

    // 计算目标速度（不含 delta，后面移动时再乘）
    const speed = this.sprint ? this.moveSpeed * this.sprintMultiplier : this.moveSpeed;

    // 冲刺因子平滑过渡（ease-in-out）
    const sprintTarget = this.sprint ? 1.0 : 0.0;
    const sprintSpeed = this.sprint ? 6.0 : 3.0; // 解除冲刺更快
    this.sprintFactor += (sprintTarget - this.sprintFactor) * Math.min(1, delta * sprintSpeed);

    // 帧率无关阻尼：使用指数衰减
    const dampFactor = Math.pow(1 - this.damping, delta * 60);
    this.velocity.x *= dampFactor;
    this.velocity.y *= dampFactor;
    this.velocity.z *= dampFactor;

    // 应用移动（velocity = 方向 × 速度，不含 delta）
    if (this.moveForward || this.moveBackward) {
      this.velocity.z = -this.direction.z * speed;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x = -this.direction.x * speed;
    }
    if (this.moveUp || this.moveDown) {
      this.velocity.y = this.direction.y * speed;
    }

    // 移动相机（只在这里乘一次 delta）
    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);
    this.camera.position.y += this.velocity.y * delta;

    // 冲刺 FOV 效果（使用平滑的 sprintFactor）
    const targetFov = this.baseFov + this.sprintFovBoost * this.sprintFactor;
    const fovDamp = 1 - Math.pow(0.001, delta);
    this.camera.fov += (targetFov - this.camera.fov) * fovDamp;
    this.camera.updateProjectionMatrix();

    // v8.0: 冲刺镜头抖动（穿越感）
    if (config.player.cameraShake !== false && this.sprintFactor > 0.01) {
      const shakeAmp = (config.player.shakeAmplitude || 1.2) * this.sprintFactor;
      const shakeFreq = config.player.shakeFrequency || 8.0;
      const t = performance.now() * 0.001;
      this.camera.position.x += Math.sin(t * shakeFreq) * shakeAmp * delta;
      this.camera.position.y += Math.cos(t * shakeFreq * 1.3) * shakeAmp * delta * 0.7;
      this.camera.position.z += Math.sin(t * shakeFreq * 0.7 + 0.5) * shakeAmp * delta * 0.5;
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
