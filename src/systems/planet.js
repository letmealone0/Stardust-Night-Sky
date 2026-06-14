/**
 * 行星/月球天体
 * 太空模式下可见的大型天体，offscreen canvas 预渲染
 * 包含球体明暗、环形山细节、大气光晕
 */

import { state } from '../core/state.js';
import { rand, wrap } from '../utils/math.js';

let planetCanvas = null;
let planetSize = 0;

/**
 * 初始化行星 offscreen canvas
 */
export function initPlanet(w, h) {
  // 释放旧离屏 canvas 让 GC 回收
  if (planetCanvas) { planetCanvas.width = 0; planetCanvas = null; }

  const dpr = Math.min(state.dpr || 1, 2);
  planetSize = Math.min(w, h) * 0.22;
  const size = planetSize;
  const pad = size * 0.4; // 光晕边距

  planetCanvas = document.createElement('canvas');
  planetCanvas.width = (size + pad * 2) * dpr;
  planetCanvas.height = (size + pad * 2) * dpr;
  const pCtx = planetCanvas.getContext('2d');
  pCtx.scale(dpr, dpr);
  const cx = (size + pad * 2) / 2;
  const cy = (size + pad * 2) / 2;
  const r = size / 2;

  // ---- 外层大气光晕 ----
  const atmoGrad = pCtx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.35);
  atmoGrad.addColorStop(0, 'rgba(100,160,220,0.0)');
  atmoGrad.addColorStop(0.5, 'rgba(80,140,210,0.08)');
  atmoGrad.addColorStop(1, 'rgba(60,100,180,0)');
  pCtx.fillStyle = atmoGrad;
  pCtx.beginPath();
  pCtx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  pCtx.fill();

  // ---- 球体主体 ----
  const bodyGrad = pCtx.createRadialGradient(
    cx - r * 0.3, cy - r * 0.35, r * 0.05,
    cx, cy, r
  );
  bodyGrad.addColorStop(0, '#e8e0d8');
  bodyGrad.addColorStop(0.3, '#c8c0b8');
  bodyGrad.addColorStop(0.6, '#908880');
  bodyGrad.addColorStop(0.85, '#504840');
  bodyGrad.addColorStop(1, '#282420');
  pCtx.fillStyle = bodyGrad;
  pCtx.beginPath();
  pCtx.arc(cx, cy, r, 0, Math.PI * 2);
  pCtx.fill();

  // ---- 环形山 ----
  for (let i = 0; i < 35; i++) {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(0.1, 0.85) * r;
    const cr = rand(r * 0.015, r * 0.08);
    const cx2 = cx + Math.cos(angle) * dist;
    const cy2 = cy + Math.sin(angle) * dist;

    // 确保在球体内
    if (Math.hypot(cx2 - cx, cy2 - cy) + cr > r * 0.95) continue;

    // 暗面
    const shadowGrad = pCtx.createRadialGradient(cx2 + cr * 0.2, cy2 + cr * 0.2, 0, cx2, cy2, cr);
    shadowGrad.addColorStop(0, 'rgba(80,70,60,0.6)');
    shadowGrad.addColorStop(1, 'rgba(60,50,40,0.8)');
    pCtx.fillStyle = shadowGrad;
    pCtx.beginPath();
    pCtx.arc(cx2, cy2, cr, 0, Math.PI * 2);
    pCtx.fill();

    // 亮边
    pCtx.strokeStyle = 'rgba(200,190,180,0.25)';
    pCtx.lineWidth = cr * 0.3;
    pCtx.beginPath();
    pCtx.arc(cx2 - cr * 0.15, cy2 - cr * 0.15, cr * 0.85, Math.PI * 0.6, Math.PI * 1.6);
    pCtx.stroke();
  }

  // ---- 月海暗斑 ----
  for (let i = 0; i < 5; i++) {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(0.2, 0.6) * r;
    const spotR = rand(r * 0.1, r * 0.25);
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const spotGrad = pCtx.createRadialGradient(sx, sy, 0, sx, sy, spotR);
    spotGrad.addColorStop(0, 'rgba(70,65,60,0.25)');
    spotGrad.addColorStop(1, 'rgba(90,85,80,0)');
    pCtx.fillStyle = spotGrad;
    pCtx.beginPath();
    pCtx.arc(sx, sy, spotR, 0, Math.PI * 2);
    pCtx.fill();
  }
}

/**
 * 绘制行星
 */
export function drawPlanet(ctx) {
  if (!planetCanvas || state.spaceFactor < 0.15) return;

  const alpha = Math.min(1, (state.spaceFactor - 0.15) / 0.5) * 0.9;
  const w = state.width;
  const h = state.height;

  // 行星在屏幕右上区域，随相机缓慢移动
  const baseX = w * 0.72;
  const baseY = h * 0.28;
  const px = wrap(baseX - state.cameraX * 0.02, w + planetSize) - planetSize * 0.3;
  const py = wrap(baseY - state.cameraY * 0.015, h + planetSize) - planetSize * 0.3;

  const cx = px + planetSize * 0.7;
  const cy = py + planetSize * 0.7;

  // 缓慢旋转 + 呼吸效果
  const rotation = state.time * 0.0001;
  const breath = Math.sin(state.time * 0.0005) * 0.01 + 1.01;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(breath, breath);
  ctx.drawImage(planetCanvas, -planetSize * 0.7, -planetSize * 0.7, planetSize * 1.4, planetSize * 1.4);
  ctx.restore();
}
