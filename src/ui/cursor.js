/**
 * 自定义光标 UI
 * 双层 CSS 光标：光晕 + 脉冲圆环
 */

import { state } from '../core/state.js';

let glowEl, ringEl;

export function initCursor() {
  glowEl = document.getElementById('cursorGlow');
  ringEl = document.getElementById('cursorRing');
}

export function updateCursor(x, y) {
  if (!glowEl || !ringEl) return;
  glowEl.style.left = x + 'px';
  glowEl.style.top = y + 'px';
  ringEl.style.left = x + 'px';
  ringEl.style.top = y + 'px';
}

export function setDraggingState(active) {
  if (!glowEl || !ringEl) return;
  glowEl.classList.toggle('dragging', active);
  ringEl.classList.toggle('dragging', active);
}

export function setSpaceMode(space) {
  if (!glowEl || !ringEl) return;
  glowEl.classList.toggle('space-mode', space);
  ringEl.classList.toggle('space-mode', space);
}
