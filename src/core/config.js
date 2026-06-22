/**
 * 深空探索 - 全局配置
 * 集中管理所有可调参数
 */

export const config = {
  // ---- 相机系统 ----
  camera: {
    fov: 75,
    near: 0.1,
    far: 10000,
    startPosition: { x: 0, y: 0, z: 100 },
  },

  // ---- 玩家控制 ----
  player: {
    moveSpeed: 50,           // 基础移动速度
    sprintMultiplier: 2.5,   // 冲刺倍数
    mouseSensitivity: 0.002, // 鼠标灵敏度
    damping: 0.05,           // 移动阻尼
  },

  // ---- 星空背景 ----
  stars: {
    count: 8000,             // 星星数量
    minSize: 0.1,            // 最小尺寸
    maxSize: 0.5,            // 最大尺寸
    spread: 5000,            // 分布范围
    layers: [
      { count: 4000, depth: 0.2, size: [0.1, 0.2] },
      { count: 2500, depth: 0.5, size: [0.15, 0.3] },
      { count: 1500, depth: 1.0, size: [0.2, 0.5] },
    ],
  },

  // ---- 行星系统 ----
  planets: {
    count: 8,                // 行星数量
    minRadius: 5,            // 最小半径
    maxRadius: 30,           // 最大半径
    spread: 3000,            // 分布范围
    atmosphereScale: 1.2,    // 大气层缩放
  },

  // ---- 星云效果 ----
  nebula: {
    count: 3,                // 星云数量
    scale: 500,              // 星云大小
    opacity: 0.15,           // 透明度
    colors: [
      { r: 0.2, g: 0.1, b: 0.5 },  // 紫色
      { r: 0.1, g: 0.3, b: 0.6 },  // 蓝色
      { r: 0.5, g: 0.1, b: 0.2 },  // 红色
    ],
  },

  // ---- 后处理效果 ----
  postprocessing: {
    bloom: {
      strength: 1.5,         // 辉光强度
      radius: 0.4,           // 辉光半径
      threshold: 0.2,        // 辉光阈值
    },
    vignette: {
      offset: 0.5,           // 暗角偏移
      darkness: 0.5,         // 暗角深度
    },
  },

  // ---- 渲染器 ----
  renderer: {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  },

  // ---- 性能优化 ----
  performance: {
    maxFPS: 60,              // 最大帧率
    lodDistances: [100, 500, 1000], // LOD 距离
  },
};
