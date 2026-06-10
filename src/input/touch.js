/**
 * 触摸输入处理
 */

import { state } from '../core/state.js';
import { rand } from '../utils/math.js';
import { applyDragDelta } from '../systems/camera.js';
import { spawnParticles } from '../systems/particles.js';

function canvasCoords(cx, cy, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (cx - rect.left) * (state.width / rect.width),
    y: (cy - rect.top) * (state.height / rect.height),
  };
}

function onTouchStart(e, canvas) {
  e.preventDefault();
  state.isDragging = true;
  const t = e.touches[0];
  state.mouseX = t.clientX;
  state.mouseY = t.clientY;
  state.dragPrevX = t.clientX;
  state.dragPrevY = t.clientY;
  state.trailPoints = [];

  const pos = canvasCoords(t.clientX, t.clientY, canvas);
  for (let i = 0; i < 10; i++) {
    spawnParticles(pos.x + rand(-8, 8), pos.y + rand(-8, 8), true);
  }
}

function onTouchMove(e, canvas) {
  e.preventDefault();
  const t = e.touches[0];
  state.mouseX = t.clientX;
  state.mouseY = t.clientY;

  if (state.isDragging) {
    const dx = t.clientX - state.dragPrevX;
    const dy = t.clientY - state.dragPrevY;
    applyDragDelta(dx, dy);
    state.dragPrevX = t.clientX;
    state.dragPrevY = t.clientY;

    const pos = canvasCoords(t.clientX, t.clientY, canvas);
    state.trailPoints.push({ x: pos.x, y: pos.y });
    if (state.trailPoints.length > state.MAX_TRAIL_PTS) state.trailPoints.shift();
    spawnParticles(pos.x, pos.y, true);
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  state.isDragging = false;
  state.mouseX = -200;
  state.mouseY = -200;
  state.trailPoints = [];
}

export function bindTouchEvents(canvas) {
  canvas.addEventListener('touchstart', (e) => onTouchStart(e, canvas), { passive: false });
  canvas.addEventListener('touchmove', (e) => onTouchMove(e, canvas), { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
}
