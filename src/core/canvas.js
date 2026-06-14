/**
 * Canvas 管理 — 尺寸适配 + 渲染循环调度
 * 支持高 DPI 显示 (Retina)
 */

import { state } from './state.js';

/** @type {HTMLCanvasElement} */
export let canvas;
/** @type {CanvasRenderingContext2D} */
export let ctx;

/**
 * 初始化 Canvas
 */
export function initCanvas(canvasId) {
  canvas = document.getElementById(canvasId);
  ctx = canvas.getContext('2d', { alpha: false });
  resize();
  window.addEventListener('resize', resize);
}

/**
 * 自适应窗口尺寸 — 物理像素适配 devicePixelRatio
 */
export function resize() {
  const dpr = window.devicePixelRatio || 1;
  state.dpr = dpr;

  // 物理像素 (backing store)
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  // CSS 尺寸
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';

  // 状态存储逻辑像素 — 所有绘制代码使用逻辑坐标
  state.width = window.innerWidth;
  state.height = window.innerHeight;
}

/**
 * 渲染循环 — 按层级顺序调用各系统
 * @param {function} renderFrame - 每一帧的回调 (timestamp)
 */
export function startLoop(renderFrame) {
  function loop(ts) {
    state.time = ts;

    // 计算 delta-time（秒），上限 0.1s 防止标签切换后的大跳跃
    if (state.lastTime > 0) {
      state.dt = Math.min((ts - state.lastTime) / 1000, 0.1);
    } else {
      state.dt = 1 / 60; // 首帧按 60fps 估算
    }
    state.lastTime = ts;

    // 标签不可见时跳过渲染，节省 CPU/电量
    if (document.hidden) {
      requestAnimationFrame(loop);
      return;
    }

    // 应用 DPI 缩放变换 — 此后所有绘制使用逻辑像素
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    // 图像平滑
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) {
      ctx.imageSmoothingQuality = 'high';
    }

    renderFrame(ts, ctx, canvas);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
