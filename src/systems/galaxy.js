/**
 * 银河带 — offscreen canvas 预渲染
 * 仅在太空模式显现
 */

import { state } from '../core/state.js';
import { rand, wrap } from '../utils/math.js';
import { hslToRgb } from '../utils/color.js';

let galaxyCanvas = null;

/**
 * 初始化银河 offscreen canvas
 */
export function initGalaxy(w, h) {
  // 释放旧离屏 canvas 让 GC 回收
  if (galaxyCanvas) { galaxyCanvas.width = 0; galaxyCanvas = null; }

  const dpr = Math.min(state.dpr || 1, 2); // 限制最大 DPR 以节省内存
  const scale = 2 * dpr;
  const maxDim = 4096;
  galaxyCanvas = document.createElement('canvas');
  galaxyCanvas.width = Math.min(w * scale, maxDim);
  galaxyCanvas.height = Math.min(h * scale, maxDim);
  const gCtx = galaxyCanvas.getContext('2d');
  const gw = galaxyCanvas.width;
  const gh = galaxyCanvas.height;

  const centerY = gh * 0.55;

  // 银河星点
  for (let i = 0; i < 2000; i++) {
    const gx = Math.random() * gw;
    const spread = gh * 0.22 * (0.3 + 0.7 * Math.abs(gx / gw - 0.5) * 2);
    const gy = centerY + (Math.random() - 0.5) * spread * 2;
    const r = rand(0.3, 1.8);
    const alpha = rand(0.15, 0.7) * (1 - Math.abs(gy - centerY) / spread);
    const col = hslToRgb(rand(200, 280), 0.3, 0.75);
    gCtx.beginPath();
    gCtx.fillStyle = `rgba(${col.r},${col.g},${col.b},${Math.max(0.02, alpha)})`;
    gCtx.arc(gx, gy, r, 0, Math.PI * 2);
    gCtx.fill();
  }

  // 核心柔光
  const coreGrad = gCtx.createRadialGradient(gw * 0.5, centerY, 0, gw * 0.5, centerY, gw * 0.6);
  coreGrad.addColorStop(0, 'rgba(140,160,220,0.12)');
  coreGrad.addColorStop(0.4, 'rgba(100,120,200,0.05)');
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  gCtx.fillStyle = coreGrad;
  gCtx.fillRect(0, 0, gw, gh);

  // 尘埃
  for (let i = 0; i < 800; i++) {
    const dx = Math.random() * gw;
    const dy = centerY + rand(-gh * 0.15, gh * 0.15);
    gCtx.beginPath();
    gCtx.fillStyle = `rgba(60,50,80,${rand(0.02, 0.08)})`;
    gCtx.arc(dx, dy, rand(2, 8), 0, Math.PI * 2);
    gCtx.fill();
  }
}

/**
 * 绘制银河
 */
export function drawGalaxy(ctx, alpha) {
  if (!galaxyCanvas || alpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const ox = wrap(-state.cameraX * 0.005, state.width);
  const oy = wrap(-state.cameraY * 0.003 + state.height * 0.05, state.height);
  const drawScale = Math.min(galaxyCanvas.width / (state.width * 2), galaxyCanvas.height / (state.height * 2));
  const dw = galaxyCanvas.width / drawScale;
  const dh = galaxyCanvas.height / drawScale;
  ctx.drawImage(galaxyCanvas,
    0, 0, galaxyCanvas.width, galaxyCanvas.height,
    -ox, -oy, dw, dh);
  ctx.restore();
}
