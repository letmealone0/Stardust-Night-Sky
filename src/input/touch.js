/**
 * 触摸输入处理
 * 点击切换相机锁定，锁定后拖动平移
 */

import { state } from '../core/state.js';
import { rand } from '../utils/math.js';
import { applyDragDelta } from '../systems/camera.js';
import { spawnParticles } from '../systems/particles.js';
import { canvasCoords } from '../utils/coords.js';

// 触摸追踪状态
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchMoved = false;
export let lastTouchTime = 0; // 用于 mouse.js 防抖

function onTouchStart(e, canvas) {
  e.preventDefault();
  lastTouchTime = performance.now(); // 记录最后触摸时间
  const t = e.touches[0];
  state.mouseX = t.clientX;
  state.mouseY = t.clientY;

  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartTime = performance.now();
  touchMoved = false;

  if (!state.cameraLocked) {
    // 自由模式：开始新的平移
    state.dragPrevX = t.clientX;
    state.dragPrevY = t.clientY;
    state.trailPoints = [];
  }
}

function onTouchMove(e, canvas) {
  e.preventDefault();
  const t = e.touches[0];
  state.mouseX = t.clientX;
  state.mouseY = t.clientY;

  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    touchMoved = true;
  }

  if (!state.cameraLocked) {
    // 自由模式：触摸拖动平移相机
    const mdx = t.clientX - state.dragPrevX;
    const mdy = t.clientY - state.dragPrevY;
    applyDragDelta(mdx, mdy);
    state.dragPrevX = t.clientX;
    state.dragPrevY = t.clientY;

    const pos = canvasCoords(t.clientX, t.clientY, canvas);
    state.trailPoints.push({ x: pos.x, y: pos.y });
    if (state.trailPoints.length > state.MAX_TRAIL_PTS) state.trailPoints.splice(0, state.trailPoints.length - state.MAX_TRAIL_PTS);
    spawnParticles(pos.x, pos.y, true);
  }
}

function onTouchEnd(e) {
  e.preventDefault();

  const duration = performance.now() - touchStartTime;
  const dx = Math.abs(state.mouseX - touchStartX);
  const dy = Math.abs(state.mouseY - touchStartY);

  // 判断为"点击"（未移动且时间短）→ 切换冻结状态
  if (!touchMoved && duration < 300 && dx < 10 && dy < 10) {
    state.cameraLocked = !state.cameraLocked;
    if (state.cameraLocked) {
      // 刚冻结：清理轨迹
      state.trailPoints = [];
    }
  }

  if (state.cameraLocked) {
    // 冻结模式：触摸结束后重置鼠标位置，清理轨迹
    state.mouseX = -200;
    state.mouseY = -200;
    state.trailPoints = [];
  }
}

export function bindTouchEvents(canvas) {
  canvas.addEventListener('touchstart', (e) => onTouchStart(e, canvas), { passive: false });
  canvas.addEventListener('touchmove', (e) => onTouchMove(e, canvas), { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
}
