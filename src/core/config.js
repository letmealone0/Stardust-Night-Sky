/**
 * 深空探索 - 全局配置
 * 集中管理所有可调参数
 */

export const config = {
  // ---- 相机系统 ----
  camera: {
    fov: 75,
    near: 1,
    far: 200000,
    startPosition: { x: 0, y: 30, z: 1200 }, // v9.0: 地球轨道外侧，朝向太阳
  },

  // ---- 玩家控制 (v9.0: 惯性飞行系统) ----
  player: {
    // 加速度 (单位/s²)
    accel: 200,              // 线性加速度
    decelDamping: 0.94,      // 松键阻尼 (每帧指数衰减, 0.94≈3秒衰减到1%)
    // 速度上限
    maxSpeed: 80,            // 普通模式最大速度
    sprintMultiplier: 3.0,   // 冲刺倍数 (maxSpeed × 3 = 240)
    // FOV
    sprintFovBoost: 25,      // 冲刺FOV增量 (75+25=100)
    mouseSensitivity: 0.002,
    // 限速
    proximitySlowdown: true, // 接近行星自动限速
    // 镜头抖动
    cameraShake: true,
    shakeAmplitude: 1.5,
    shakeFrequency: 10.0,
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
    // v8.2: 银河系包围太阳系 — 太阳系在旋臂~2/3处
    galaxy: {
      count: 18000,            // 银河粒子数
      armCount: 5,            // 旋臂数
      spin: 2.5,              // 螺旋紧密度
      armSpread: 0.25,        // 旋臂散开度
      position: { x: -15000, y: 500, z: -30000 }, // 银河中心偏移，太阳系在旋臂中
      tilt: 50,               // 银道面倾角
      scale: 22.0,            // v8.2: 超大尺度，太阳系在旋臂中
      hazeCount: 3000,        // 雾气粒子数
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
    sunRadius: 120,
    timeScale: 0.5,
    sunLightIntensity: 5.0,  // v9.0: PBR材质需要更强光照
    sunLightRange: 25000,
    ambientIntensity: 0.12, // v9.5: 稍增环境光,暗面可见
  },

  // ---- 星云效果（体积光线步进）----
  nebula: {
    count: 3,                // v8.2: 减少数量，提升质量
    scale: 600,              // v8.2: 稍小但更精致
    opacity: 1.5,            // v8.2: 更高透明度
    colors: [
      { r: 0.25, g: 0.08, b: 0.55 },  // 深紫
      { r: 0.08, g: 0.3, b: 0.65 },   // 深蓝
      { r: 0.5, g: 0.12, b: 0.2 },    // 暗红
    ],
    respawnDistance: 8000,   // v8.2: 匹配更大世界\n    respawnMin: 4000,        // v8.2\n    respawnMax: 7000,        // v8.2
  },

  // ---- 后处理效果 ----
  postprocessing: {
    bloom: {
      strength: 0.7,         // v9.0: 适中辉光，突出太阳
      radius: 0.4,           // v9.0
      threshold: 0.65,       // v9.0: 仅太阳/亮行星发光
    },
    vignette: {
      offset: 0.5,
      darkness: 0.25,        // v9.0: 轻微暗角
    },
    filmGrain: {             // v9.0: 可选胶片颗粒
      enabled: false,
      strength: 0.03,
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
    count: 8000,               // v8.3: 更多粒子增强穿越感
    spread: 150,               // v8.3: 更集中，粒子密度更高
    sprintColorBoost: 1.5,
    streakLength: 5.0,         // v8.3: 更长拖尾
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
