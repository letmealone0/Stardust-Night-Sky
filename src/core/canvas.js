/**
 * Canvas 管理 — 尺寸适配 + 渲染循环调度
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
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

/**
 * 自适应窗口尺寸
 */
export function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  state.width = canvas.width;
  state.height = canvas.height;
}

/**
 * 渲染循环 — 按层级顺序调用各系统
 * @param {function} renderFrame - 每一帧的回调 (timestamp)
 */
export function startLoop(renderFrame) {
  function loop(ts) {
    state.time = ts;
    resize(); // 每帧检查尺寸
    renderFrame(ts, ctx, canvas);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
