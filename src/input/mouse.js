/**
 * 鼠标输入处理
 * 将鼠标事件转换为状态更新
 */

import { state } from '../core/state.js';
import { rand } from '../utils/math.js';
import { applyDragDelta } from '../systems/camera.js';
import { spawnParticles, spawnBezierParticles } from '../systems/particles.js';

function canvasCoords(cx, cy, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (cx - rect.left) * (state.width / rect.width),
    y: (cy - rect.top) * (state.height / rect.height),
  };
}

export function onMouseMove(e, canvas) {
  state.mouseX = e.clientX;
  state.mouseY = e.clientY;

  const pos = canvasCoords(e.clientX, e.clientY, canvas);

  if (state.isDragging) {
    const dx = e.clientX - state.dragPrevX;
    const dy = e.clientY - state.dragPrevY;
    applyDragDelta(dx, dy);
    state.dragPrevX = e.clientX;
    state.dragPrevY = e.clientY;

    // 记录拖尾点
    state.trailPoints.push({ x: pos.x, y: pos.y });
    if (state.trailPoints.length > state.MAX_TRAIL_PTS) state.trailPoints.shift();

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
    spawnParticles(pos.x, pos.y, false);
  }
}

export function onMouseDown(e, canvas) {
  state.isDragging = true;
  state.dragPrevX = e.clientX;
  state.dragPrevY = e.clientY;
  state.trailPoints = [];

  const pos = canvasCoords(e.clientX, e.clientY, canvas);
  for (let i = 0; i < 12; i++) {
    spawnParticles(pos.x + rand(-10, 10), pos.y + rand(-10, 10), true);
  }
}

export function onMouseUp() {
  state.isDragging = false;
  state.trailPoints = [];
}

export function onMouseLeave() {
  state.mouseX = -200;
  state.mouseY = -200;
  state.isDragging = false;
  state.trailPoints = [];
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
