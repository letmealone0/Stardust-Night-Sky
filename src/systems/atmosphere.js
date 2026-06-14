/**
 * 大气渐变渲染
 * 低海拔时底部蓝紫大气 + 地平线暖光，高空逐渐消失
 * 增强版：更多色阶过渡，更平滑的大气散射效果
 * 带渐变缓存：只在 atmoAlpha 变化时重新创建渐变
 */

import { state } from '../core/state.js';
import { config } from '../core/config.js';
import { easeOut } from '../utils/math.js';

// 渐变缓存
let cachedAtmoAlpha = -1;
let cachedGrad = null;
let cachedHorizonGrad = null;
let cachedW = 0;
let cachedH = 0;

/**
 * 绘制大气层
 */
export function drawAtmosphere(ctx) {
  const atmoAlpha = 1 - easeOut(Math.min(1, state.altitude / config.ATMOSPHERE_FADE_ALTITUDE));
  if (atmoAlpha < 0.01) return;

  const w = state.width;
  const h = state.height;

  // 只在 atmoAlpha 或画布尺寸变化时重建渐变 (四舍五入到 0.01 精度)
  const alphaKey = Math.round(atmoAlpha * 100) / 100;
  if (alphaKey !== cachedAtmoAlpha || w !== cachedW || h !== cachedH) {
    cachedAtmoAlpha = alphaKey;
    cachedW = w;
    cachedH = h;

    // 主大气渐变 — 8 阶平滑过渡
    cachedGrad = ctx.createLinearGradient(0, h, 0, 0);
    cachedGrad.addColorStop(0, `rgba(12,20,65,${atmoAlpha * 0.9})`);
    cachedGrad.addColorStop(0.08, `rgba(14,22,58,${atmoAlpha * 0.8})`);
    cachedGrad.addColorStop(0.18, `rgba(18,16,50,${atmoAlpha * 0.65})`);
    cachedGrad.addColorStop(0.3, `rgba(20,15,45,${atmoAlpha * 0.48})`);
    cachedGrad.addColorStop(0.45, `rgba(15,10,35,${atmoAlpha * 0.3})`);
    cachedGrad.addColorStop(0.62, `rgba(8,5,22,${atmoAlpha * 0.15})`);
    cachedGrad.addColorStop(0.8, `rgba(3,2,10,${atmoAlpha * 0.05})`);
    cachedGrad.addColorStop(1, 'rgba(0,0,0,0)');

    // 地平线暖光 — 多层渐变模拟散射
    cachedHorizonGrad = ctx.createLinearGradient(0, h * config.HORIZON_GLOW_START, 0, h);
    cachedHorizonGrad.addColorStop(0, 'rgba(0,0,0,0)');
    cachedHorizonGrad.addColorStop(0.15, `rgba(255,160,70,${atmoAlpha * 0.06})`);
    cachedHorizonGrad.addColorStop(0.4, `rgba(255,145,55,${atmoAlpha * 0.13})`);
    cachedHorizonGrad.addColorStop(0.7, `rgba(255,120,40,${atmoAlpha * 0.22})`);
    cachedHorizonGrad.addColorStop(1, `rgba(255,90,20,${atmoAlpha * 0.32})`);
  }

  // 使用缓存的渐变绘制
  ctx.fillStyle = cachedGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = cachedHorizonGrad;
  ctx.fillRect(0, h * config.HORIZON_GLOW_START, w, h * (1 - config.HORIZON_GLOW_START));
}
