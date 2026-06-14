/**
 * 彗星/流星系统
 * 偶尔有流星划过屏幕，高海拔出现频率更高
 */

import { state } from '../core/state.js';
import { config } from '../core/config.js';
import { rand } from '../utils/math.js';
import { hslToRgb } from '../utils/color.js';

/** 两次彗星之间的最小间隔 (ms) */
const MIN_COMET_INTERVAL = config.MIN_COMET_INTERVAL;
const MAX_COMET_INTERVAL = config.MAX_COMET_INTERVAL;
const MAX_COMETS = config.MAX_COMETS;

/**
 * 创建一颗彗星
 */
function createComet() {
  const w = state.width;
  const h = state.height;

  // 随机方向（偏斜向）
  const angle = rand(-0.6, 0.6) + (Math.random() > 0.5 ? Math.PI * 0.15 : Math.PI * 0.85);
  const length = rand(w * 0.5, w * 1.3);
  const startX = w / 2 - Math.cos(angle) * length / 2;
  const startY = h / 2 - Math.sin(angle) * length / 2;

  return {
    x: startX,
    y: startY,
    vx: Math.cos(angle) * rand(4, 9),
    vy: Math.sin(angle) * rand(4, 9),
    life: 1.0,
    maxLife: rand(0.8, 1.8),
    hue: rand(30, 280),
    tailLength: rand(30, 80),
    headSize: rand(1.5, 3.5),
  };
}

/**
 * 每帧更新彗星
 */
export function updateComets() {
  // 太空中更频繁
  const minInterval = state.isSpaceMode ? MIN_COMET_INTERVAL * 0.5 : MIN_COMET_INTERVAL;
  const maxInterval = state.isSpaceMode ? MAX_COMET_INTERVAL * 0.5 : MAX_COMET_INTERVAL;

  if (state.time > state.nextCometTime && state.comets.length < MAX_COMETS) {
    state.comets.push(createComet());
    state.nextCometTime = state.time + rand(minInterval, maxInterval);
  }

  // 更新现有彗星
  const dtScale = state.dt * 60;
  for (let i = state.comets.length - 1; i >= 0; i--) {
    const c = state.comets[i];
    c.x += c.vx * dtScale;
    c.y += c.vy * dtScale;
    c.life -= state.dt / c.maxLife;

    // 超出屏幕或生命结束则移除
    if (c.life <= 0 ||
      c.x < -200 || c.x > state.width + 200 ||
      c.y < -200 || c.y > state.height + 200) {
      state.comets.splice(i, 1);
    }
  }
}

/**
 * 绘制彗星
 */
export function drawComets(ctx) {
  for (const c of state.comets) {
    const alpha = c.life * 0.9;
    if (alpha < 0.02) continue;

    const col = hslToRgb(c.hue, 0.5, 0.8);
    const tailAlpha = alpha * 0.7;

    // 彗尾（多层渐变）
    for (let t = 0; t < c.tailLength; t += 2) {
      const ratio = t / c.tailLength;
      const tx = c.x - c.vx * t * 0.5;
      const ty = c.y - c.vy * t * 0.5;
      const ta = tailAlpha * (1 - ratio) * (1 - ratio);

      ctx.beginPath();
      ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${ta})`;
      ctx.arc(tx, ty, c.headSize * (1 - ratio * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }

    // 头部亮核
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const headGlow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.headSize * 4);
    headGlow.addColorStop(0, `rgba(255,255,240,${alpha * 0.9})`);
    headGlow.addColorStop(0.3, `rgba(${col.r},${col.g},${col.b},${alpha * 0.6})`);
    headGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = headGlow;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.headSize * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
