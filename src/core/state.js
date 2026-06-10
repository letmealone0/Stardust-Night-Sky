/**
 * 全局状态 — 单一数据源
 * 所有模块通过 import { state } 读写同一份状态
 */

export const state = {
  // ---- Canvas 尺寸 ----
  width: 0,
  height: 0,

  // ---- 时间 ----
  time: 0,

  // ---- 鼠标 ----
  mouseX: -200,
  mouseY: -200,
  smoothMouseX: -200,
  smoothMouseY: -200,
  isDragging: false,

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
  MAX_PARTICLES: 500,

  // ---- 拖尾轨迹 (贝塞尔用) ----
  trailPoints: [],
  MAX_TRAIL_PTS: 40,

  // ---- 彗星 ----
  comets: [],
  nextCometTime: 0,
};
