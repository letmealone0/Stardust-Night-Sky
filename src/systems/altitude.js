/**
 * 高度/海拔系统
 * 鼠标 Y → 海拔值 (0=地表, 1=太空)
 *
 * 改进：非线性的高度映射，使大气层区间更宽广，
 * 需要鼠标移动更多才能到达太空，增加过渡美感。
 */

import { state } from '../core/state.js';
import { config } from '../core/config.js';
import { lerp, dtLerp } from '../utils/math.js';

/** 太空阈值 */
const SPACE_THRESHOLD = config.SPACE_THRESHOLD;

/** 非线性映射指数 */
const ALTITUDE_POWER = config.ALTITUDE_POWER;

/** 高度过渡速度 */
const ALTITUDE_LERP = config.ALTITUDE_LERP;

/** spaceFactor 过渡起点 */
const SPACE_TRANSITION_START = config.SPACE_TRANSITION_START;

/**
 * 每帧更新海拔
 */
export function updateAltitude() {
  if (!state.cameraLocked && state.mouseY > 0) {
    // 自由模式：根据鼠标 Y 更新高度
    const raw = 1 - state.mouseY / state.height;
    state.targetAltitude = Math.pow(Math.max(0, Math.min(1, raw)), ALTITUDE_POWER);
  }
  // 冻结模式：targetAltitude 保持不变，画面高度锁定

  // 缓慢平滑过渡 (帧率无关)
  state.altitude = dtLerp(state.altitude, state.targetAltitude, ALTITUDE_LERP, state.dt);

  // 太空模式
  state.isSpaceMode = state.altitude > SPACE_THRESHOLD;
  const rawFactor = (state.altitude - SPACE_TRANSITION_START) / (1 - SPACE_TRANSITION_START);
  state.spaceFactor = Math.max(0, Math.min(1, rawFactor));
}

/**
 * 获取当前海拔对应的区域名称
 */
export function getAltitudeZone() {
  if (state.altitude > config.ZONE_SPACE) return 'space';
  if (state.altitude > config.ZONE_HIGH) return 'high';
  if (state.altitude > config.ZONE_ATMOSPHERE) return 'atmosphere';
  return 'ground';
}
