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
    this.damping = config.player.damping;

    // Ctrl 防误触
    this._ctrlPressed = false;
  }

  /**
   * 初始化控制器
   */
  init() {
    this.controls = new PointerLockControls(this.camera, this.domElement);

    // 绑定键盘事件
    this.bindKeyboardEvents();

    console.log('[PlayerController] 控制器初始化完成');
  }

  /**
   * 绑定键盘事件
   */
  bindKeyboardEvents() {
    // 在 capture 阶段彻底杀死所有 Ctrl 组合键
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.onKeyDown(e);
    }, { capture: true });

    window.addEventListener('keyup', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.onKeyUp(e);
    }, { capture: true });

    // beforeunload 作为兜底：防止 Ctrl+W 关闭页面
    window.addEventListener('beforeunload', (e) => {
      if (this._ctrlPressed) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /**
   * 键盘按下
   */
  onKeyDown(event) {
    // 阻止默认行为
    if (['Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(event.code)) {
      event.preventDefault();
    }

    // 追踪 Ctrl 按下状态（用于 beforeunload 兜底）
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
      this._ctrlPressed = true;
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
      case 'ControlLeft':
      case 'ControlRight':
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
      case 'ControlLeft':
      case 'ControlRight':
        this.moveDown = false;
        this._ctrlPressed = false;
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

    // 计算速度
    const speed = this.sprint ? this.moveSpeed * this.sprintMultiplier : this.moveSpeed;

    // 应用阻尼
    this.velocity.x -= this.velocity.x * this.damping;
    this.velocity.y -= this.velocity.y * this.damping;
    this.velocity.z -= this.velocity.z * this.damping;

    // 应用移动
    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * speed * delta;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x -= this.direction.x * speed * delta;
    }
    if (this.moveUp || this.moveDown) {
      this.velocity.y += this.direction.y * speed * delta;
    }

    // 移动相机
    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);
    this.camera.position.y += this.velocity.y * delta;
  }

  /**
   * 获取移动速度（用于 HUD 显示）
   */
  getSpeed() {
    return this.velocity.length();
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
