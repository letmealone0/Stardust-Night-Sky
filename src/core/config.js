/**
 * 集中化配置 — 所有可调参数
 * 所有模块通过 import { config } 读取配置
 */

export const config = {
  // ---- 粒子系统 ----
  MAX_PARTICLES: 500,
  MAX_TRAIL_PTS: 40,

  // 鼠标引力
  MOUSE_GRAVITY_R_FREE: 240,   // 自由模式粒子引力半径
  MOUSE_GRAVITY_R_LOCKED: 130, // 冻结模式粒子引力半径
  MOUSE_GRAVITY_FORCE_FREE: 0.06,
  MOUSE_GRAVITY_FORCE_LOCKED: 0.02,
  GRAVITY_DAMPING: 0.97,

  // 星座连线
  CONNECT_DIST: 80,            // 连线最大距离
  CONNECT_MIN_LIFE: 0.15,      // 低于此生命值不参与连线

  // 粒子寿命 (秒)
  PARTICLE_LIFE_FREE: [0.5, 1.4],
  PARTICLE_LIFE_INTENSE: [1.0, 2.2],
  PARTICLE_SIZE_FREE: [1.5, 5.0],
  PARTICLE_SIZE_INTENSE: [2.5, 7.5],

  // ---- 相机系统 ----
  DRAG_SENSITIVITY: 0.5,
  FOLLOW_SPEED: 0.1,
  MOUSE_SMOOTH_SPEED: 0.1,

  // ---- 高度系统 ----
  SPACE_THRESHOLD: 0.82,       // 太空模式阈值
  ALTITUDE_POWER: 2.5,         // 非线性映射指数
  ALTITUDE_LERP: 0.015,        // 高度过渡速度
  SPACE_TRANSITION_START: 0.7, // spaceFactor 过渡起点

  // 区域阈值
  ZONE_SPACE: 0.82,
  ZONE_HIGH: 0.45,
  ZONE_ATMOSPHERE: 0.15,

  // ---- 大气系统 ----
  ATMOSPHERE_FADE_ALTITUDE: 0.35, // 大气完全消失的海拔
  HORIZON_GLOW_START: 0.78,       // 地平线暖光起始位置 (屏幕比例)

  // ---- 彗星系统 ----
  MAX_COMETS: 3,
  MIN_COMET_INTERVAL: 4000,
  MAX_COMET_INTERVAL: 18000,

  // ---- 鼠标辉光 (main.js) ----
  MOUSE_GLOW_R_FREE: 70,
  MOUSE_GLOW_R_LOCKED: 38,

  // ---- 背景星空 ----
  STAR_LAYERS: [
    { count: 180, alpha: [0.08, 0.22], size: [0.3, 0.9], hue: [30, 270], depth: 0.15 },
    { count: 130, alpha: [0.15, 0.5], size: [0.4, 1.1], hue: [30, 280], depth: 0.4 },
    { count: 70,  alpha: [0.3, 1.2],  size: [0.5, 1.4], hue: [30, 290], depth: 0.85 },
  ],
  SPACE_STARS_COUNT: 500,
  SPACE_NEAR_STARS_COUNT: 150,
  SPACE_STARS_DEPTH: 0.5,
  SPACE_NEAR_DEPTH: 0.7,

  // ---- 视觉效果 ----
  VIGNETTE_MAX_ALPHA: 0.45,
};
