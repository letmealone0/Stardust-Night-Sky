/**
 * 鼠标输入处理
 * 将鼠标事件转换为状态更新
 * 点击切换相机锁定模式
 */

import { state } from '../core/state.js';
import { rand } from '../utils/math.js';
import { applyDragDelta } from '../systems/camera.js';
import { spawnParticles, spawnBezierParticles } from '../systems/particles.js';
import { canvasCoords } from '../utils/coords.js';
import { lastTouchTime } from './touch.js';

export function onMouseMove(e, canvas) {
  state.mouseX = e.clientX;
  state.mouseY = e.clientY;

  const pos = canvasCoords(e.clientX, e.clientY, canvas);

  if (!state.cameraLocked) {
    // 自由模式：相机跟随鼠标平移
    const dx = e.clientX - state.dragPrevX;
    const dy = e.clientY - state.dragPrevY;
    applyDragDelta(dx, dy);
    state.dragPrevX = e.clientX;
    state.dragPrevY = e.clientY;

    // 记录拖尾点
    state.trailPoints.push({ x: pos.x, y: pos.y });
    if (state.trailPoints.length > state.MAX_TRAIL_PTS) state.trailPoints.splice(0, state.trailPoints.length - state.MAX_TRAIL_PTS);

    // 贝塞尔平滑生成粒子
    const speed = Math.hypot(dx, dy);
    if (state.trailPoints.length >= 3 && speed > 5) {
      spawnBezierParticles(true);
    } else {
      spawnParticles(pos.x, pos.y, true);
    }

    // 高速额外爆发
    if (speed > 25) {
      for (let i = 0; i < 3; i++) {
        spawnParticles(pos.x + rand(-6, 6), pos.y + rand(-6, 6), true);
      }
    }
  } else {
    // 冻结模式：鼠标移动不影响相机，仅轻柔粒子
    spawnParticles(pos.x, pos.y, false);
  }
}

export function onMouseDown(e, canvas) {
  // 触摸后 300ms 内忽略 mousedown，避免双击触发
  if (performance.now() - lastTouchTime < 300) return;

  // 点击切换冻结状态
  state.cameraLocked = !state.cameraLocked;

  if (!state.cameraLocked) {
    // 刚解冻：初始化拖拽参考点，避免首帧跳跃
    state.dragPrevX = e.clientX;
    state.dragPrevY = e.clientY;
  }

  // 清空轨迹
  state.trailPoints = [];

  // 切换时爆发粒子（自由模式粒子更多更强）
  const pos = canvasCoords(e.clientX, e.clientY, canvas);
  const burstCount = state.cameraLocked ? 8 : 14;
  for (let i = 0; i < burstCount; i++) {
    spawnParticles(pos.x + rand(-10, 10), pos.y + rand(-10, 10), !state.cameraLocked);
  }
}

export function onMouseUp() {
  // 不再结束拖拽 — 由点击切换控制
}

export function onMouseLeave() {
  state.mouseX = -200;
  state.mouseY = -200;
  // 不改变 cameraLocked，保持冻结/自由状态
}

export function onMouseEnter(e) {
  state.mouseX = e.clientX;
  state.mouseY = e.clientY;
}

/**
 * 绑定所有鼠标事件
 */
export function bindMouseEvents(canvas) {
  document.addEventListener('mousemove', (e) => onMouseMove(e, canvas), { passive: true });
  document.addEventListener('mousedown', (e) => onMouseDown(e, canvas));
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('mouseenter', onMouseEnter);
}
