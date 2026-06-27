/**
 * 深空探索 - 全局配置
 * 集中管理所有可调参数
 */

export const config = {
  // ---- 相机系统 ----
  camera: {
    fov: 75,
    near: 1,
    far: 50000,              // v8.1: 更远裁剪面匹配银河距离
    startPosition: { x: 1090, y: 30, z: 5 }, // v8.1: 地球轨道附近出发
  },

  // ---- 玩家控制 ----
  player: {
    moveSpeed: 50,           // 基础移动速度
    sprintMultiplier: 4.0,   // 冲刺倍数（增强加速感）
    sprintFovBoost: 18,      // 冲刺时 FOV 增加量（v8.0: 增强）
    mouseSensitivity: 0.002, // 鼠标灵敏度
    damping: 0.05,           // 移动阻尼
    cameraShake: true,       // v8.0: 冲刺镜头抖动
    shakeAmplitude: 1.2,     // v8.0: 抖动幅度
    shakeFrequency: 8.0,     // v8.0: 抖动频率 (Hz)
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
    // v8.1: 银河系背景配置 — 远距离壮丽天幕
    galaxy: {
      count: 15000,            // 银河粒子数
      armCount: 5,            // 旋臂数
      spin: 2.5,              // 螺旋紧密度
      armSpread: 0.25,        // 旋臂散开度
      position: { x: 0, y: -12000, z: -28000 }, // v8.1: 极远处天幕
      tilt: 55,               // v8.1: 更倾斜，横跨视野
      scale: 6.0,             // v8.1: 大幅放大
      hazeCount: 2500,        // 雾气粒子数
    },
  },

  // ---- 行星系统（随机生成的额外星体）----
  planets: {
    count: 4,                // 额外随机行星数量（减少，太阳系已有 8 颗）
    minRadius: 40,           // 最小半径
    maxRadius: 200,          // 最大半径
    spread: 5000,            // 分布范围
    atmosphereScale: 1.15,   // 大气层缩放
    respawnDistance: 8000,   // v8.0: 超出此距离重生行星
    respawnMin: 7000,        // v8.0: 严格远离太阳系
    respawnMax: 9000,        // v8.0
  },

  // ---- 太阳系 ----
  solarSystem: {
    sunRadius: 120,          // v8.0: 太阳更大更壮观
    timeScale: 0.5,          // 时间缩放（每秒游戏时间对应多少天）
    sunLightIntensity: 4.0,  // 太阳点光源强度（v8.0）
    sunLightRange: 20000,    // 太阳点光源范围（v8.0）
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
      strength: 0.9,         // v8.0: 微调辉光强度
      radius: 0.3,           // 辉光半径
      threshold: 0.55,       // v8.0: 降低阈值，让更多物体发光
    },
    vignette: {
      offset: 0.5,           // 暗角偏移
      darkness: 0.3,         // 暗角深度
    },
    motionBlur: {            // v8.0: 运动模糊（仅冲刺时）
      strength: 0.08,        // 模糊强度
      samples: 3,            // 采样次数
    },
  },

  // ---- 渲染器 ----
  renderer: {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    toneMappingExposure: 1.2, // v8.0: 提高曝光，适应更亮的太阳
  },

  // ---- 速度线 ----
  speedLines: {
    count: 1000,             // v8.0: 大幅增加线数
    minRadius: 1.0,          // 最小分布半径
    maxRadius: 18.0,         // v8.0: 更大分布范围
    minLength: 15,           // v8.0: 更长线段
    maxLength: 80,           // v8.0: 更长
    zStart: -100,            // v8.0
    zEnd: -10,               // v8.0
    speedThreshold: 1.5,     // v8.0: 更易触发
    opacityTarget: 1.2,      // v8.0: 更亮
    opacitySpeed: 0.25,      // 透明度过渡速度
    moveFactor: 25,          // v8.0: 更快流动
    sprintExtraCount: 200,   // v8.0: 冲刺额外亮线
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
    count: 2500,               // v8.0: 平衡性能与视觉
    spread: 6000,              // 分布范围
    recenterDistance: 3000,    // 超出此距离重新居中
  },

  // ---- 全方向粒子流 ----
  particleFlow: {
    count: 6000,               // v8.0: 平衡性能与视觉
    spread: 200,               // v8.0: 更大分布范围
    sprintColorBoost: 1.5,     // v8.0: 冲刺颜色增强
    streakLength: 4.0,         // v8.0: 粒子拖尾长度
  },

  // ---- 性能优化 ----
  performance: {
    lodDistances: [0, 800, 2000], // LOD 距离阈值
    adaptiveQuality: true,     // v8.0: 自适应画质
    minTargetFPS: 35,          // v8.0: 低于此FPS自动降质
    qualityDropThreshold: 3,   // v8.0: 持续低于阈值秒数
    warmupSeconds: 3,          // v8.0: 启动预热时间（期间不降质）
  },
};
