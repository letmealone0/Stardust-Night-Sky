/**
 * 星尘夜空 — 主入口
 * 初始化所有模块并启动渲染循环
 */

import { state } from './core/state.js';
import { initCanvas, startLoop } from './core/canvas.js';

import { updateAltitude } from './systems/altitude.js';
import { updateCamera } from './systems/camera.js';
import { initBackgrounds, drawBackgrounds } from './systems/background.js';
import { drawAtmosphere } from './systems/atmosphere.js';
import { initGalaxy, drawGalaxy } from './systems/galaxy.js';
import { initNebula, drawNebula } from './systems/nebula.js';
import { initPlanet, drawPlanet } from './systems/planet.js';
import { updateComets, drawComets } from './systems/comets.js';
import {
  updateParticles,
  drawParticles,
  drawDragTrail,
} from './systems/particles.js';

import { bindMouseEvents, onMouseMove } from './input/mouse.js';
import { bindTouchEvents } from './input/touch.js';
import { initCursor, updateCursor, setDraggingState, setSpaceMode } from './ui/cursor.js';
import { initIndicator, updateIndicator } from './ui/indicator.js';
import { initToast } from './ui/toast.js';

import { rand, easeOut, lerp } from './utils/math.js';
import { hslToRgb } from './utils/color.js';

// ==================== 初始化 ====================

function init() {
  initCanvas('starCanvas');
  initCursor();
  initIndicator();
  initToast();

  initBackgrounds(state.width, state.height);
  initNebula(state.width, state.height);
  initGalaxy(state.width, state.height);
  initPlanet(state.width, state.height);

  bindMouseEvents(document.getElementById('starCanvas'));
  bindTouchEvents(document.getElementById('starCanvas'));
  window.addEventListener('blur', () => {
    state.isDragging = false;
    state.trailPoints = [];
  });

  // 重设 offscreen canvas 的 resize 处理
  let wasResizing = false;
  window.addEventListener('resize', () => {
    if (wasResizing) return;
    wasResizing = true;
    setTimeout(() => {
      initBackgrounds(state.width, state.height);
      initNebula(state.width, state.height);
      initGalaxy(state.width, state.height);
      initPlanet(state.width, state.height);
      wasResizing = false;
    }, 200);
  });

  updateCursor(-100, -100);

  // 启动渲染循环
  startLoop(renderFrame);
}

// ==================== 渲染帧 ====================

function renderFrame(ts, ctx, canvas) {
  // ---- 更新阶段 ----
  // 平滑鼠标坐标
  state.smoothMouseX = lerp(state.smoothMouseX, state.mouseX, 0.1);
  state.smoothMouseY = lerp(state.smoothMouseY, state.mouseY, 0.1);

  updateAltitude();
  updateCamera();
  updateParticles();
  updateComets();

  // 同步光标 DOM 状态
  setDraggingState(state.isDragging);
  setSpaceMode(state.isSpaceMode);
  updateIndicator();

  // ---- 渲染阶段 (按层顺序) ----

  // 1. 纯黑底
  ctx.fillStyle = '#010108';
  ctx.fillRect(0, 0, state.width, state.height);

  // 2. 银河
  const galaxyAlpha = easeOut(state.spaceFactor) * 0.75;
  drawGalaxy(ctx, galaxyAlpha);

  // 3. 大气
  drawAtmosphere(ctx);

  // 4. 星云
  const nebulaAlpha = (1 - state.spaceFactor) * 0.7;
  drawNebula(ctx, nebulaAlpha);

  // 5. 背景星层
  drawBackgrounds(ctx);

  // 6. 行星 (太空模式)
  drawPlanet(ctx);

  // 7. 彗星
  drawComets(ctx);

  // 8. 拖动轨迹
  drawDragTrail(ctx);

  // 9. 粒子
  drawParticles(ctx);

  // 10. 鼠标微光
  drawMouseGlow(ctx);

  // 11. 太空拖拽速度线
  drawSpeedLines(ctx);
}

// ==================== 鼠标微光 ====================

function drawMouseGlow(ctx) {
  if (state.smoothMouseX <= 0 || state.smoothMouseY <= 0) return;

  const r = state.isDragging ? 70 : 38;
  const glow = ctx.createRadialGradient(
    state.smoothMouseX, state.smoothMouseY, 0,
    state.smoothMouseX, state.smoothMouseY, r,
  );

  if (state.isSpaceMode) {
    glow.addColorStop(0,
      state.isDragging ? 'rgba(180,210,255,0.2)' : 'rgba(150,180,240,0.07)');
  } else {
    glow.addColorStop(0,
      state.isDragging ? 'rgba(255,220,140,0.2)' : 'rgba(200,180,240,0.07)');
  }
  glow.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(state.smoothMouseX, state.smoothMouseY, r, 0, Math.PI * 2);
  ctx.fill();
}

// ==================== 太空拖拽速度线 ====================

function drawSpeedLines(ctx) {
  if (!state.isDragging || !state.isSpaceMode || state.trailPoints.length < 2) return;

  const last = state.trailPoints[state.trailPoints.length - 1];
  const prev = state.trailPoints[Math.max(0, state.trailPoints.length - 3)];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const speed = Math.hypot(dx, dy);
  if (speed < 3) return;

  const nx = dx / speed;
  const ny = dy / speed;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const lx = last.x - nx * rand(30, 120);
    const ly = last.y - ny * rand(30, 120);
    const a = rand(0.05, 0.2);
    ctx.strokeStyle = `rgba(180,210,255,${a})`;
    ctx.lineWidth = rand(0.5, 1.5);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx - nx * rand(20, 60), ly - ny * rand(20, 60));
    ctx.stroke();
  }
  ctx.restore();
}

// ==================== 光标 DOM 位置同步 ====================
document.addEventListener('mousemove', (e) => {
  updateCursor(e.clientX, e.clientY);
}, { passive: true });

// ==================== 启动 ====================
init();
