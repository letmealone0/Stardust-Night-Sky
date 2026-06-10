/**
 * 粒子系统
 * 创建、更新、渲染拖尾粒子
 * 包含贝塞尔曲线缓动优化
 */

import { state } from '../core/state.js';
import { rand, randInt, lerp, dist, quadraticBezier } from '../utils/math.js';
import { hslToRgb } from '../utils/color.js';

// ==================== 创建 ====================

function createParticle(x, y, intense) {
  const alt = state.altitude;
  const hueLow = rand(25, 50);
  const hueSpace = rand(190, 290);
  const hue = lerp(hueLow, hueSpace, alt);
  const col = hslToRgb(hue, 0.55, 0.7 + alt * 0.15);
  const size = intense ? rand(2.5, 7.5) : rand(1.5, 5);
  const life = intense ? rand(1.0, 2.2) : rand(0.5, 1.4);
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
  const count = intense ? randInt(2, 5) : 1;
  for (let i = 0; i < count; i++) {
    const ox = intense ? rand(-4, 4) : rand(-1.5, 1.5);
    const oy = intense ? rand(-4, 4) : rand(-1.5, 1.5);
    state.particles.push(createParticle(x + ox, y + oy, intense));
  }
  while (state.particles.length > state.MAX_PARTICLES) state.particles.shift();
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
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    p.life -= (1 / 60) / p.maxLife;
    if (p.life <= 0) { pts.splice(i, 1); continue; }

    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotSpeed;

    // 鼠标引力
    const d = dist(p.x, p.y, state.smoothMouseX, state.smoothMouseY);
    const r = state.isDragging ? 240 : 130;
    if (d < r && d > 3) {
      const force = state.isDragging ? 0.06 : 0.02;
      const f = force * (1 - d / r);
      p.vx += (state.smoothMouseX - p.x) / d * f;
      p.vy += (state.smoothMouseY - p.y) / d * f;
      p.vx *= 0.97;
      p.vy *= 0.97;
    }

    const lf = p.life;
    p.size = p.maxSize * (0.25 + 0.75 * Math.sin(Math.PI * lf));
  }
}

// ==================== 绘制 ====================

function drawStarShape(ctx, x, y, outerR, innerR, rot, alpha, color) {
  const spikes = 4, step = Math.PI / spikes;
  ctx.save();
  ctx.globalAlpha = alpha;
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
  ctx.restore();
}

export function drawParticles(ctx) {
  // ---- additive 光晕 ----
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    const alpha = p.life * 0.8;
    if (alpha < 0.02) continue;
    const { r, g, b } = p.color;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
    glow.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.7})`);
    glow.addColorStop(0.35, `rgba(${r},${g},${b},${alpha * 0.22})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ---- 星座连线 ----
  const CONNECT = 80;
  ctx.save();
  for (let i = 0; i < state.particles.length; i++) {
    const a = state.particles[i];
    if (a.life < 0.15) continue;
    for (let j = i + 1; j < state.particles.length; j++) {
      const b = state.particles[j];
      if (b.life < 0.15) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < CONNECT) {
        const alpha = (1 - d / CONNECT) * 0.4 * Math.min(a.life, b.life);
        const mr = (a.color.r + b.color.r) >> 1;
        const mg = (a.color.g + b.color.g) >> 1;
        const mb = (a.color.b + b.color.b) >> 1;
        ctx.strokeStyle = `rgba(${mr},${mg},${mb},${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

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
  if (pts.length < 2 || !state.isDragging) return;

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
