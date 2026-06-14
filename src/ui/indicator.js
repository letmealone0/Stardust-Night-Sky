/**
 * 高度指示器 + 状态标签 UI
 */

import { state } from '../core/state.js';

let barEl, fillEl, markerEl, tagEl;
let prevSpace = false;

export function initIndicator() {
  barEl = document.getElementById('altitudeBar');
  fillEl = document.getElementById('altitudeFill');
  markerEl = document.getElementById('altitudeMarker');
  tagEl = document.getElementById('statusTag');
}

export function updateIndicator() {
  if (!barEl || !fillEl || !markerEl || !tagEl) return;

  // 可见性
  barEl.classList.toggle('visible', state.mouseY > 0);

  // 填充高度
  const pct = state.altitude * 100;
  fillEl.style.height = pct + '%';
  markerEl.style.bottom = pct + '%';

  // 渐变颜色
  if (state.isSpaceMode) {
    fillEl.style.background = 'linear-gradient(to top, #88bbff, #ccddff, #ffffff)';
  } else if (!state.cameraLocked) {
    // 自由移动模式：粉色渐变
    fillEl.style.background = 'linear-gradient(to top, #ff8844, #ffbb66, #ff99cc)';
  } else {
    fillEl.style.background = 'linear-gradient(to top, #ff8844, #ffbb66, #88aadd)';
  }

  // 状态标签
  if (state.isSpaceMode && !prevSpace) {
    tagEl.textContent = '太 空';
    tagEl.classList.add('show', 'space');
    prevSpace = true;
  } else if (!state.isSpaceMode && prevSpace) {
    prevSpace = false;
  }

  if (!state.isSpaceMode) {
    if (state.altitude > 0.45) {
      tagEl.textContent = '高 空';
      tagEl.classList.add('show');
      tagEl.classList.remove('space');
    } else if (state.altitude > 0.15) {
      tagEl.textContent = '大 气 层';
      tagEl.classList.add('show');
      tagEl.classList.remove('space');
    } else {
      tagEl.classList.remove('show');
    }
  }
}
