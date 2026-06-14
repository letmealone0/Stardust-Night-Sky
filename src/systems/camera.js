/**
 * 相机平移系统
 * 拖动鼠标时平移世界坐标，松开后弹性回中
 */

import { state } from '../core/state.js';
import { config } from '../core/config.js';
import { lerp, wrap, dtLerp } from '../utils/math.js';

/** 相机跟随速度 */
const FOLLOW_SPEED = config.FOLLOW_SPEED;
const DRAG_SENSITIVITY = config.DRAG_SENSITIVITY;

/**
 * 每帧更新相机位置
 */
export function updateCamera() {
  if (state.cameraLocked) {
    // 冻结模式：相机停在原位，不做任何移动
    return;
  }
  // 自由模式：相机平滑跟随目标位置 (帧率无关)
  state.cameraX = dtLerp(state.cameraX, state.targetCameraX, FOLLOW_SPEED, state.dt);
  state.cameraY = dtLerp(state.cameraY, state.targetCameraY, FOLLOW_SPEED, state.dt);
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
