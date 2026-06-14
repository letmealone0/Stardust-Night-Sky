/**
 * Canvas 坐标转换工具
 * 将客户端坐标转换为 canvas 逻辑像素坐标
 */

import { state } from '../core/state.js';

/**
 * 客户端坐标 → Canvas 逻辑像素坐标
 */
export function canvasCoords(cx, cy, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (cx - rect.left) * (state.width / rect.width),
    y: (cy - rect.top) * (state.height / rect.height),
  };
}
