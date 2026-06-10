/**
 * 相机平移系统
 * 拖动鼠标时平移世界坐标，松开后弹性回中
 */

import { state } from '../core/state.js';
import { lerp, wrap } from '../utils/math.js';

/** 拖动灵敏度 */
const DRAG_SENSITIVITY = 0.5;

/** 回中速度 */
const RETURN_SPEED = 0.035;

/** 相机跟随速度 */
const FOLLOW_SPEED = 0.1;

/**
 * 每帧更新相机位置
 */
export function updateCamera() {
  if (!state.isDragging) {
    // 缓慢回中
    state.targetCameraX = lerp(state.targetCameraX, 0, RETURN_SPEED);
    state.targetCameraY = lerp(state.targetCameraY, 0, RETURN_SPEED);
  }
  state.cameraX = lerp(state.cameraX, state.targetCameraX, FOLLOW_SPEED);
  state.cameraY = lerp(state.cameraY, state.targetCameraY, FOLLOW_SPEED);
}

/**
 * 拖动时更新相机目标
 */
export function applyDragDelta(dx, dy) {
  state.targetCameraX -= dx * DRAG_SENSITIVITY;
  state.targetCameraY -= dy * DRAG_SENSITIVITY;
}

/**
 * 世界坐标 → 屏幕坐标
 */
export function worldToScreen(wx, wy, depthFactor) {
  return {
    x: wrap(wx - state.cameraX * depthFactor, state.width),
    y: wrap(wy - state.cameraY * depthFactor, state.height),
  };
}
