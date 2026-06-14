/**
 * 全局状态 — 单一数据源
 * 所有模块通过 import { state } 读写同一份状态
 */

import { config } from './config.js';

export const state = {
  // ---- Canvas 尺寸 ----
  width: 0,
  height: 0,
  dpr: 1,

  // ---- 时间 ----
  time: 0,
  dt: 0,          // 当前帧 delta time (秒)，上限 0.1
  lastTime: 0,    // 上一帧时间戳

  // ---- 鼠标 ----
  mouseX: -200,
  mouseY: -200,
  smoothMouseX: -200,
  smoothMouseY: -200,
  cameraLocked: true,   // 默认冻结画面，鼠标移动不拖动视角

  // ---- 相机 (世界平移) ----
  cameraX: 0,
  cameraY: 0,
  targetCameraX: 0,
  targetCameraY: 0,
  dragPrevX: 0,
  dragPrevY: 0,

  // ---- 高度系统 ----
  altitude: 0,
  targetAltitude: 0,
  isSpaceMode: false,
  spaceFactor: 0,

  // ---- 粒子 ----
  particles: [],
  MAX_PARTICLES: config.MAX_PARTICLES,

  // ---- 拖尾轨迹 (贝塞尔用) ----
  trailPoints: [],
  MAX_TRAIL_PTS: config.MAX_TRAIL_PTS,

  // ---- 彗星 ----
  comets: [],
  nextCometTime: 0,

  // ---- 可访问性 ----
  reducedMotion: false,  // prefers-reduced-motion
};
