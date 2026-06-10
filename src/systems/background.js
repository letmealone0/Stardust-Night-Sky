/**
 * 背景星层系统
 * 3 层视差星空 + 太空模式额外密集星层
 */

import { state } from '../core/state.js';
import { rand } from '../utils/math.js';
import { hslToRgb } from '../utils/color.js';
import { worldToScreen } from './camera.js';

class StarField {
  constructor(count, alphaRange, sizeRange, hueRange) {
    this.stars = [];
    this.count = count;
    this.alphaRange = alphaRange;
    this.sizeRange = sizeRange;
    this.hueRange = hueRange;
  }

  init(w, h) {
    this.stars = [];
    for (let i = 0; i < this.count; i++) {
      this.stars.push({
        wx: Math.random() * w,
        wy: Math.random() * h,
        r: rand(this.sizeRange[0], this.sizeRange[1]),
        baseAlpha: rand(this.alphaRange[0], this.alphaRange[1]),
        twinkleSpeed: rand(0.4, 2),
        twinklePhase: rand(0, Math.PI * 2),
        hue: rand(this.hueRange[0], this.hueRange[1]),
      });
    }
  }

  draw(ctx, depthMul, alphaMul = 1) {
    const t = state.time;
    for (const s of this.stars) {
      const sc = worldToScreen(s.wx, s.wy, depthMul);
      const twinkle = 0.5 + 0.5 * Math.sin(t * 0.002 * s.twinkleSpeed + s.twinklePhase);
      const alpha = s.baseAlpha * (0.55 + 0.45 * twinkle) * alphaMul;
      const col = hslToRgb(s.hue, 0.35, 0.65 + 0.3 * twinkle);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;
      ctx.arc(sc.x, sc.y, s.r * (0.75 + 0.25 * twinkle), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 3 层视差星空（始终可见）
export const bgStars = [
  new StarField(180, [0.08, 0.22], [0.3, 0.9], [30, 270]),
  new StarField(130, [0.15, 0.5], [0.4, 1.1], [30, 280]),
  new StarField(70, [0.3, 1.2], [0.5, 1.4], [30, 290]),
];

// 对应每层的视差乘数
export const bgDepthMuls = [0.15, 0.4, 0.85];

// 太空密集星层
export const spaceStars = new StarField(500, [0.4, 1.8], [0.3, 1.6], [180, 320]);
export const spaceNearStars = new StarField(150, [0.6, 2.2], [0.6, 2.2], [190, 300]);

/**
 * 初始化所有星层
 */
export function initBackgrounds(w, h) {
  bgStars.forEach(l => l.init(w, h));
  spaceStars.init(w, h);
  spaceNearStars.init(w, h);
}

/**
 * 绘制背景星空
 */
export function drawBackgrounds(ctx) {
  // 3 层常规星
  const extraAlpha = 1 + state.spaceFactor * 0.3;
  for (let i = 0; i < bgStars.length; i++) {
    ctx.save();
    ctx.globalAlpha = extraAlpha;
    bgStars[i].draw(ctx, bgDepthMuls[i]);
    ctx.restore();
  }

  // 太空密星
  if (state.spaceFactor > 0.01) {
    ctx.save();
    ctx.globalAlpha = state.spaceFactor * 1.1;
    spaceStars.draw(ctx, 0.5);
    spaceNearStars.draw(ctx, 0.7);
    ctx.restore();
  }
}
