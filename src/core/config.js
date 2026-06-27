/**
 * 深空探索 - 全局配置
 * 集中管理所有可调参数
 */

export const config = {
  // ---- 相机系统 ----
  camera: {
    fov: 75,
    near: 1,                 // 近裁剪面加大，防止靠近大行星穿模
    far: 20000,              // 加大远裁剪面，匹配扩大后的星空范围
    startPosition: { x: 0, y: 0, z: 100 },
  },

  // ---- 玩家控制 ----
  player: {
    moveSpeed: 50,           // 基础移动速度
    sprintMultiplier: 4.0,   // 冲刺倍数（增强加速感）
    sprintFovBoost: 15,      // 冲刺时 FOV 增加量
    mouseSensitivity: 0.002, // 鼠标灵敏度
    damping: 0.05,           // 移动阻尼
  },

  // ---- 星空背景 ----
  stars: {
    count: 8000,             // 星星数量
    minSize: 0.1,            // 最小尺寸
    maxSize: 0.5,            // 最大尺寸
    spread: 10000,           // 分布范围（加大，探索更远也不会出界）
    layers: [
      { count: 4000, depth: 0.2, size: [0.1, 0.2] },
      { count: 2500, depth: 0.5, size: [0.15, 0.3] },
      { count: 1500, depth: 1.0, size: [0.2, 0.5] },
    ],
  },

  // ---- 行星系统（随机生成的额外星体）----
  planets: {
    count: 4,                // 额外随机行星数量（减少，太阳系已有 8 颗）
    minRadius: 40,           // 最小半径
    maxRadius: 200,          // 最大半径
    spread: 3000,            // 分布范围
    atmosphereScale: 1.15,   // 大气层缩放
    respawnDistance: 2500,   // 超出此距离重生行星
    respawnMin: 600,         // 重生最小距离
    respawnMax: 1800,        // 重生最大距离
  },

  // ---- 太阳系 ----
  solarSystem: {
    sunRadius: 80,           // 太阳半径
    timeScale: 0.5,          // 时间缩放（每秒游戏时间对应多少天）
  },

  // ---- 星云效果（体积光线步进）----
  nebula: {
    count: 4,                // 星云数量
    scale: 1200,             // 体积边界盒大小（翻倍，穿越感更强）
    opacity: 1.0,            // 基础透明度（Shader 内部控制衰减）
    colors: [
      { r: 0.3, g: 0.1, b: 0.6 },  // 深紫
      { r: 0.1, g: 0.35, b: 0.7 }, // 深蓝
      { r: 0.6, g: 0.15, b: 0.25 },// 暗红
      { r: 0.15, g: 0.5, b: 0.4 }, // 青绿
    ],
    respawnDistance: 5000,   // 超出此距离重生星云（匹配更大 scale）
    respawnMin: 2000,        // 重生最小距离
    respawnMax: 4000,        // 重生最大距离
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
    opacityTarget: 0.9,      // 最大透明度（冲刺时更强）
    opacitySpeed: 0.2,       // 透明度过渡速度
    moveFactor: 15,          // 移动速度系数（冲刺时线段更快）
  },

  // ---- 黑洞系统 ----
  blackhole: {
    eventHorizonRadius: 25,    // 事件视界半径（加大）
    accretionInnerRadius: 40,  // 吸积盘内半径（加大）
    accretionOuterRadius: 200, // 吸积盘外半径（加大，更壮观）
    position: { x: 800, y: 50, z: -600 }, // 位置
    dangerRadius: 600,         // 危险区域半径（加大）
    pullRadius: 300,           // 引力影响半径（加大）
    pullStrength: 80,          // 引力强度
    jetLength: 400,            // 喷流长度（加长，更远可见）
    absorbRadius: 80,          // 行星吸收半径
    respawnDistance: 3000,     // 超出此距离重生黑洞
    respawnMin: 800,           // 重生最小距离
    respawnMax: 2000,          // 重生最大距离
  },

  // ---- 脉冲星系统 ----
  pulsar: {
    radius: 5,                 // 半径（加大）
    beamLength: 300,           // 光束长度（翻倍，更远可见）
    rotationSpeed: 5,          // 旋转速度（弧度/秒）
    position: { x: -500, y: 100, z: 400 }, // 位置
    color: { r: 0.5, g: 0.8, b: 1.0 },    // 颜色
    respawnDistance: 3000,     // 超出此距离重生脉冲星
    respawnMin: 800,           // 重生最小距离
    respawnMax: 2000,          // 重生最大距离
  },

  // ---- 宇宙尘埃 ----
  cosmicDust: {
    count: 2000,               // 粒子数
    spread: 6000,              // 分布范围（加大）
    recenterDistance: 3000,    // 超出此距离重新居中
  },

  // ---- 全方向粒子流 ----
  particleFlow: {
    count: 3000,               // 粒子数（跟随相机的流动粒子）
  },

  // ---- 性能优化 ----
  performance: {
    lodDistances: [0, 800, 2000], // LOD 距离阈值（匹配更大行星）
  },
};
