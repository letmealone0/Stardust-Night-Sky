/**
 * 大气渐变渲染
 * 低海拔时底部蓝紫大气 + 地平线暖光，高空逐渐消失
 */

import { state } from '../core/state.js';
import { easeOut } from '../utils/math.js';

/**
 * 绘制大气层
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawAtmosphere(ctx) {
  const atmoAlpha = 1 - easeOut(Math.min(1, state.altitude / 0.35));
  if (atmoAlpha < 0.01) return;

  const w = state.width;
  const h = state.height;

  // 主大气渐变
  const grad = ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, `rgba(15,25,70,${atmoAlpha * 0.85})`);
  grad.addColorStop(0.3, `rgba(20,15,50,${atmoAlpha * 0.5})`);
  grad.addColorStop(0.6, `rgba(8,5,25,${atmoAlpha * 0.2})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 地平线暖光
  const hGrad = ctx.createLinearGradient(0, h * 0.85, 0, h);
  hGrad.addColorStop(0, 'rgba(0,0,0,0)');
  hGrad.addColorStop(0.5, `rgba(255,140,60,${atmoAlpha * 0.15})`);
  hGrad.addColorStop(1, `rgba(255,100,30,${atmoAlpha * 0.25})`);
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, h * 0.85, w, h * 0.15);
}
