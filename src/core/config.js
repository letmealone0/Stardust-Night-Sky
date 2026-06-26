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
      strength: 0.8,         // 辉光强度（降低避免闪烁）
      radius: 0.3,           // 辉光半径
      threshold: 0.6,        // 辉光阈值（提高避免闪烁）
    },
    vignette: {
      offset: 0.5,           // 暗角偏移
      darkness: 0.3,         // 暗角深度（降低）
    },
  },

  // ---- 渲染器 ----
  renderer: {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  },

  // ---- 速度线 ----
  speedLines: {
    count: 300,              // 数量
    minRadius: 1.5,          // 最小分布半径
    maxRadius: 13.5,         // 最大分布半径
    minLength: 10,           // 最短线长
    maxLength: 50,           // 最长线长
    zStart: -85,             // 起始 Z 距离
    zEnd: -15,               // 结束 Z 距离
    speedThreshold: 2,       // 显示阈值
    opacityTarget: 0.7,      // 最大透明度
    opacitySpeed: 0.15,      // 透明度过渡速度
    moveFactor: 10,          // 移动速度系数
  },

  // ---- 黑洞系统 ----
  blackhole: {
    eventHorizonRadius: 15,    // 事件视界半径
    accretionInnerRadius: 25,  // 吸积盘内半径
    accretionOuterRadius: 80,  // 吸积盘外半径
    position: { x: 800, y: 50, z: -600 }, // 位置
    dangerRadius: 200,         // 危险区域半径
    pullRadius: 100,           // 引力影响半径
    pullStrength: 50,          // 引力强度
    jetLength: 200,            // 喷流长度
  },

  // ---- 脉冲星系统 ----
  pulsar: {
    radius: 3,                 // 半径
    beamLength: 150,           // 光束长度
    rotationSpeed: 5,          // 旋转速度（弧度/秒）
    position: { x: -500, y: 100, z: 400 }, // 位置
    color: { r: 0.5, g: 0.8, b: 1.0 },    // 颜色
  },

  // ---- 性能优化 ----
  performance: {
    lodDistances: [0, 300, 800], // LOD 距离阈值
  },
};
