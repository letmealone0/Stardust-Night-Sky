/**
 * 粒子系统
 * 创建、更新、渲染拖尾粒子
 * 包含贝塞尔曲线缓动优化 + 预渲染辉光 Sprite Sheet
 */

import { state } from '../core/state.js';
import { config } from '../core/config.js';
import { rand, randInt, lerp, dist, quadraticBezier } from '../utils/math.js';
import { hslToRgb } from '../utils/color.js';

// ==================== 辉光 Sprite Sheet ====================

// 辉光尺寸列表 (直径)
const GLOW_SIZES = [8, 12, 18, 26, 36, 50, 70, 96, 130, 176];
let glowSpriteSheet = null;

/**
 * 预渲染粒子辉光 Sprite Sheet
 * 初始化时调用一次，绘制循环中用 drawImage 替代 createRadialGradient
 */
function initGlowSprites() {
  if (glowSpriteSheet) return; // 仅初始化一次

  const count = GLOW_SIZES.length;
  const maxSize = GLOW_SIZES[count - 1];
  // 水平排列所有辉光
  const totalW = GLOW_SIZES.reduce((s, v) => s + v, 0) + count * 2;
  glowSpriteSheet = document.createElement('canvas');
  glowSpriteSheet.width = totalW;
  glowSpriteSheet.height = maxSize;

  const gCtx = glowSpriteSheet.getContext('2d');
  let offsetX = 1;

  for (let i = 0; i < count; i++) {
    const d = GLOW_SIZES[i];
    const r = d / 2;
    const cx = offsetX + r;
    const cy = maxSize / 2;

    // 9 阶平滑辉光渐变（避免 banding）
    const grad = gCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,250,0.95)');
    grad.addColorStop(0.05, 'rgba(255,250,240,0.85)');
    grad.addColorStop(0.12, 'rgba(255,240,220,0.65)');
    grad.addColorStop(0.22, 'rgba(255,230,200,0.42)');
    grad.addColorStop(0.35, 'rgba(255,210,160,0.22)');
    grad.addColorStop(0.5, 'rgba(255,180,120,0.08)');
    grad.addColorStop(0.68, 'rgba(200,140,80,0.02)');
    grad.addColorStop(0.85, 'rgba(100,60,30,0.004)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    gCtx.fillStyle = grad;
    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.fill();

    // 记录位置以便查找
    GLOW_SIZES[i] = { d, offsetX, r };
    offsetX += d + 2;
  }
}

// ==================== 创建 ====================

function createParticle(x, y, intense) {
  const alt = state.altitude;
  const hueLow = rand(25, 50);
  const hueSpace = rand(190, 290);
  const hue = lerp(hueLow, hueSpace, alt);
  const col = hslToRgb(hue, 0.55, 0.7 + alt * 0.15);
  const sizeRange = intense ? config.PARTICLE_SIZE_INTENSE : config.PARTICLE_SIZE_FREE;
  const lifeRange = intense ? config.PARTICLE_LIFE_INTENSE : config.PARTICLE_LIFE_FREE;
  const size = rand(sizeRange[0], sizeRange[1]);
  const life = rand(lifeRange[0], lifeRange[1]);
  const angle = rand(0, Math.PI * 2);
  const speed = intense ? rand(0.2, 1.0) : rand(0.04, 0.35);

  return {
    x, y,
    size, maxSize: size,
    life: 1.0, maxLife: life,
    color: col,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue,
    rotation: rand(0, Math.PI * 2),
    rotSpeed: rand(-0.03, 0.03),
  };
}

export function spawnParticles(x, y, intense) {
  if (x < 0 || x > state.width || y < 0 || y > state.height) return;
  if (state.reducedMotion && state.particles.length > 50) return; // 减量
  const count = intense ? randInt(2, 5) : 1;
  for (let i = 0; i < count; i++) {
    const ox = intense ? rand(-4, 4) : rand(-1.5, 1.5);
    const oy = intense ? rand(-4, 4) : rand(-1.5, 1.5);
    state.particles.push(createParticle(x + ox, y + oy, intense));
  }
  if (state.particles.length > state.MAX_PARTICLES) state.particles.splice(0, state.particles.length - state.MAX_PARTICLES);
}

/**
 * 沿贝塞尔曲线生成粒子（拖拽平滑优化）
 * 使用 trailPoints 最近的 3 个点做二次贝塞尔插值
 */
export function spawnBezierParticles(intense) {
  const pts = state.trailPoints;
  if (pts.length < 3) return;

  const count = intense ? 3 : 1;
  const p0 = pts[pts.length - 3];
  const p1 = pts[pts.length - 2];
  const p2 = pts[pts.length - 1];

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const pt = quadraticBezier(p0, p1, p2, t);
    spawnParticles(pt.x, pt.y, intense);
  }
}

// ==================== 更新 ====================

export function updateParticles() {
  const pts = state.particles;
  const dt = state.dt;
  const dtScale = dt * 60; // 60fps 归一化缩放因子
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    p.life -= dt / p.maxLife;
    if (p.life <= 0) { pts.splice(i, 1); continue; }

    p.x += p.vx * dtScale;
    p.y += p.vy * dtScale;
    p.rotation += p.rotSpeed * dtScale;

    // 鼠标引力 (reducedMotion 时跳过)
    if (!state.reducedMotion) {
      const d = dist(p.x, p.y, state.smoothMouseX, state.smoothMouseY);
      const r = !state.cameraLocked ? config.MOUSE_GRAVITY_R_FREE : config.MOUSE_GRAVITY_R_LOCKED;
      if (d < r && d > 3) {
        const force = !state.cameraLocked ? config.MOUSE_GRAVITY_FORCE_FREE : config.MOUSE_GRAVITY_FORCE_LOCKED;
        const f = force * (1 - d / r);
        p.vx += (state.smoothMouseX - p.x) / d * f;
        p.vy += (state.smoothMouseY - p.y) / d * f;
        p.vx *= config.GRAVITY_DAMPING;
        p.vy *= config.GRAVITY_DAMPING;
      }
    }

    const lf = p.life;
    p.size = p.maxSize * (0.25 + 0.75 * Math.sin(Math.PI * lf));
  }
}

// ==================== 绘制 ====================

function drawStarShape(ctx, x, y, outerR, innerR, rot, alpha, color) {
  const spikes = 4, step = Math.PI / spikes;
  // alpha 已预先烘焙到 color 参数中，无需额外 save/globalAlpha/restore
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = rot + i * step;
    const sx = x + Math.cos(a) * r;
    const sy = y + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawParticles(ctx) {
  // 延迟初始化辉光 Sprite Sheet
  initGlowSprites();

  const sizes = GLOW_SIZES;
  const sCount = sizes.length;

  // ---- additive 光晕 (使用预渲染 Sprite Sheet) ----
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    const alpha = p.life * 0.8;
    if (alpha < 0.02) continue;
    const glowR = p.size * 3.5;
    const dTarget = glowR * 2; // 目标直径

    // 查找最接近的预渲染辉光尺寸
    let best = sizes[0];
    for (let s = 1; s < sCount; s++) {
      if (Math.abs(sizes[s].d - dTarget) < Math.abs(best.d - dTarget)) best = sizes[s];
    }

    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSpriteSheet,
      best.offsetX, 0, best.d, glowSpriteSheet.height,                   // 源区域
      p.x - glowR, p.y - glowR, dTarget, dTarget);                       // 目标区域
  }
  ctx.restore();

  // ---- 星座连线 (reducedMotion 时跳过) ----
  const CONNECT = config.CONNECT_DIST;
  const MIN_LIFE = config.CONNECT_MIN_LIFE;
  const particles = state.particles;
  const n = particles.length;

  if (n > 1 && !state.reducedMotion) {
    // 构建空间哈希网格
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      if (p.life < MIN_LIFE) continue;
      const cx = Math.floor(p.x / CONNECT);
      const cy = Math.floor(p.y / CONNECT);
      const key = cx + ',' + cy;
      let cell = grid.get(key);
      if (!cell) { cell = []; grid.set(key, cell); }
      cell.push(i);
    }

    // 对每个粒子，只检查同格及 8 个邻格的粒子
    ctx.save();
    for (let i = 0; i < n; i++) {
      const a = particles[i];
      if (a.life < MIN_LIFE) continue;
      const cx = Math.floor(a.x / CONNECT);
      const cy = Math.floor(a.y / CONNECT);

      // 检查 3x3 邻域
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get((cx + dx) + ',' + (cy + dy));
          if (!cell) continue;
          for (let k = 0; k < cell.length; k++) {
            const j = cell[k];
            if (j <= i) continue;  // 避免重复
            const b = particles[j];
            if (b.life < MIN_LIFE) continue;
            const d = dist(a.x, a.y, b.x, b.y);
            if (d < CONNECT) {
              const alpha = (1 - d / CONNECT) * 0.4 * Math.min(a.life, b.life);
              const mr = (a.color.r + b.color.r) >> 1;
              const mg = (a.color.g + b.color.g) >> 1;
              const mb = (a.color.b + b.color.b) >> 1;
              // 光晕线（柔化）
              ctx.strokeStyle = `rgba(${mr},${mg},${mb},${alpha * 0.3})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
              // 主线
              ctx.strokeStyle = `rgba(${mr},${mg},${mb},${alpha})`;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }
    }
    ctx.restore();
  }

  // ---- 星形核心 ----
  for (const p of state.particles) {
    const alpha = p.life * 0.85;
    if (alpha < 0.03) continue;
    const { r, g, b } = p.color;

    if (p.size > 2.5) {
      drawStarShape(ctx, p.x, p.y, p.size * 1.15, p.size * 0.32,
        p.rotation, alpha, `rgba(255,255,245,${alpha * 0.95})`);
      drawStarShape(ctx, p.x, p.y, p.size * 0.7, p.size * 0.18,
        p.rotation + Math.PI / 4, alpha * 0.8,
        `rgba(${r},${g},${b},${alpha * 0.85})`);

      // 亮星衍射光芒 (alpha 已烘焙到 strokeStyle 中)
      if (p.size > 4.0) {
        const spikeAlpha = alpha * 0.25;
        const spikeLen = p.size * 4;
        ctx.strokeStyle = `rgba(255,255,245,${spikeAlpha})`;
        ctx.lineWidth = 0.4;
        // 水平光芒
        ctx.beginPath();
        ctx.moveTo(p.x - spikeLen, p.y);
        ctx.lineTo(p.x + spikeLen, p.y);
        ctx.stroke();
        // 垂直光芒
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - spikeLen);
        ctx.lineTo(p.x, p.y + spikeLen);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,250,${alpha * 0.75})`;
    ctx.arc(p.x, p.y, p.size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ==================== 拖动轨迹绘制 ====================

export function drawDragTrail(ctx) {
  const pts = state.trailPoints;
  if (pts.length < 2 || state.cameraLocked) return;

  ctx.save();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const alpha = (i / pts.length) * 0.35;
    ctx.strokeStyle = `rgba(180,200,255,${alpha})`;
    ctx.lineWidth = lerp(0.3, 2.5, i / pts.length);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}
