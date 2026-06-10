/**
 * 星云 — offscreen canvas 预渲染
 * 中低空可见，随海拔升高淡出
 */

import { state } from '../core/state.js';
import { rand, wrap } from '../utils/math.js';
import { hslToRgb } from '../utils/color.js';

let nebulaCanvas = null;

/**
 * 初始化星云
 */
export function initNebula(w, h) {
  nebulaCanvas = document.createElement('canvas');
  nebulaCanvas.width = w;
  nebulaCanvas.height = h;
  const nCtx = nebulaCanvas.getContext('2d');

  const nebulae = [
    { x: w * 0.3, y: h * 0.4, rx: w * 0.5, ry: h * 0.35, hue: 260, a: 0.06 },
    { x: w * 0.7, y: h * 0.55, rx: w * 0.4, ry: h * 0.3, hue: 290, a: 0.05 },
    { x: w * 0.5, y: h * 0.2, rx: w * 0.5, ry: h * 0.22, hue: 225, a: 0.04 },
  ];

  for (const n of nebulae) {
    const col = hslToRgb(n.hue, 0.5, 0.5);
    const grad = nCtx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(n.rx, n.ry));
    grad.addColorStop(0, `rgba(${col.r},${col.g},${col.b},${n.a})`);
    grad.addColorStop(0.5, `rgba(${col.r},${col.g},${col.b},${n.a * 0.4})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    nCtx.fillStyle = grad;
    nCtx.beginPath();
    nCtx.ellipse(n.x, n.y, n.rx, n.ry, rand(0, Math.PI), 0, Math.PI * 2);
    nCtx.fill();
  }
}

/**
 * 绘制星云
 */
export function drawNebula(ctx, alpha) {
  if (!nebulaCanvas || alpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const ox = wrap(-state.cameraX * 0.003, state.width);
  const oy = wrap(-state.cameraY * 0.003, state.height);
  ctx.drawImage(nebulaCanvas,
    ox - state.width * 0.1, oy - state.height * 0.1,
    state.width * 1.2, state.height * 1.2);
  ctx.restore();
}
