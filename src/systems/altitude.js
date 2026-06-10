/**
 * 高度/海拔系统
 * 鼠标 Y → 海拔值 (0=地表, 1=太空)
 *
 * 改进：非线性的高度映射，使大气层区间更宽广，
 * 需要鼠标移动更多才能到达太空，增加过渡美感。
 */

import { state } from '../core/state.js';
import { lerp } from '../utils/math.js';

/** 太空阈值 */
const SPACE_THRESHOLD = 0.82;

/** 非线性映射指数 (>1 压缩高处，扩展低处) */
const ALTITUDE_POWER = 2.5;

/**
 * 每帧更新海拔
 */
export function updateAltitude() {
  if (state.mouseY > 0) {
    // 线性归一化
    const raw = 1 - state.mouseY / state.height;
    // 非线性映射：让中低空占据更大的鼠标行程
    state.targetAltitude = Math.pow(Math.max(0, Math.min(1, raw)), ALTITUDE_POWER);
  }

  // 缓慢平滑过渡 (lerp 0.015 — 比原来的 0.06 慢很多)
  state.altitude = lerp(state.altitude, state.targetAltitude, 0.015);

  // 太空模式
  state.isSpaceMode = state.altitude > SPACE_THRESHOLD;
  const rawFactor = (state.altitude - 0.7) / (1 - 0.7); // 从 0.7 开始过渡
  state.spaceFactor = Math.max(0, Math.min(1, rawFactor));
}

/**
 * 获取当前海拔对应的区域名称
 */
export function getAltitudeZone() {
  if (state.altitude > 0.82) return 'space';
  if (state.altitude > 0.45) return 'high';
  if (state.altitude > 0.15) return 'atmosphere';
  return 'ground';
}
