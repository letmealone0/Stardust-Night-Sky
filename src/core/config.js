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
    startPosition: { x: 7000, y: 3500, z: -28000 }, // v27.7: 太阳系内，俯瞰内行星~火星轨道外
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
    // v25-fix: 银河系 — 对数螺旋四层结构
    galaxy: {
      count: 40000,           // v25: 增加到40000支撑四层
      armCount: 4,            // v25: 4条主旋臂（标准棒旋星系）
      spin: 4.5,              // v25: 对数螺旋紧密度
      armSpread: 0.12,        // v25: 收紧旋臂让结构更清晰
      position: { x: -15000, y: 500, z: -30000 },
      tilt: 50,
      scale: 8.0,             // v25-fix4: 缩小到8（从22降），银河半径=40000，玩家在外部
      hazeCount: 7000,        // v26: 增强雾气，模拟电离氢区发光
      // v25-fix: 四层配比 — 减少核球和银晕，突出旋臂
      coreBulgeRatio: 0.06,   // v25-fix: 核球6%（从12%减半）
      armRatio: 0.62,         // v25-fix: 旋臂62%（从55%增加）
      dustRatio: 0.16,        // 尘埃暗带16%
      haloRatio: 0.16,        // v25-fix: 银晕16%（从18%减少）
      // v25-fix: 核球参数 — 缩小并压暗
      bulgeRadius: 0.06,      // v25-fix: 核球6%（从8%缩小）
      bulgeBrightness: 1.0,   // v25-fix: 核球不额外增亮（从2.0降到1.0）
      // v25: 旋臂渐宽
      armWidenFactor: 0.05,   // v26: 降低增宽，旋臂更收敛清晰
    },
    // v25-fix: 深场背景星星 — 极稀疏壳层，避免形成实心球
    deepField: {
      count: 20000,              // v25-fix: 80000→20000，大幅减少
      spread: 18000,             // 分布范围
      opacity: 0.08,             // v25-fix: 透明度降低
      minSize: 0.05,             // 最小尺寸
      maxSize: 0.15,             // 最大尺寸
    },
  },

  // ---- 行星系统（随机生成的额外星体）----
  planets: {
    count: 4,                // 额外随机行星数量
    distFromCenterMin: 5000,  // 距银河中心最小距离
    distFromCenterMax: 32000, // v26: 约束在旋臂半径1.1倍内
    minRadius: 40,           // 最小半径
    maxRadius: 200,          // 最大半径
    spread: 5000,            // 分布范围（fallback）
    atmosphereScale: 1.25,   // v13: 更厚大气层
    // v11: 5 类行星
    types: ['rocky', 'gas', 'lava', 'ice', 'rogue'],
    rogueRatio: 0.3,         // 流浪行星占比 (其余为恒星系统型)
    moonChance: 0.2,         // 20% 概率带卫星
    maxMoons: 3,             // 最多卫星数
    asteroidBeltChance: 0.3, // 30% 概率带小行星带
    asteroidBeltCount: 120,  // 小行星带粒子数
    infoDistance: 600,        // 靠近显示天体信息的距离
    hostStarRadius: 8,       // 宿主小恒星半径
  },

  // ---- 太阳系 ----
  solarSystem: {
    sunRadius: 120,
    timeScale: 0.5,
    sunLightIntensity: 5.0,  // v9.0: PBR材质需要更强光照
    sunLightRange: 25000,
    ambientIntensity: 0.12, // v9.5: 稍增环境光,暗面可见
  },

  // ---- 银河系宏观运动 (v10.0) ----
  galaxyMotion: {
    enabled: true,             // 一键开关所有宏观运动
    timeScale: 1.0,            // 全局速度倍率
    coreRotSpeed: 0.015,      // v14: 加速差速自转让银河更有动感
    radiusFalloff: 0.00004,    // 较差自转衰减系数
    solarOrbitRadius: 22000,   // v26.2: 嵌入旋臂中段外侧，太阳系落在猎户座旋臂内
    solarOrbitSpeed: 0.0015,   // 太阳系公转角速度 (rad/s, ~70s一圈)
  },

  // ---- 星云效果（v20: 多层粒子系统）----
  nebula: {
    count: 3,
    distFromCenterMin: 15000,  // 距银河中心最小距离
    distFromCenterMax: 36000,  // v26: 约束在旋臂半径1.1倍内
    scale: 2000,              // v20: 粒子云团范围
    colors: [ /* 由 typeColors 覆盖 */ ],
    // v20: 三类星云
    types: ['emission', 'reflection', 'dark'],
    typeColors: {
      emission:    { r: 0.42, g: 0.10, b: 0.55 },
      reflection:  { r: 0.10, g: 0.20, b: 0.60 },
      dark:        { r: 0.04, g: 0.03, b: 0.07 },
    },
    turbulenceSpeed: 0.015,
    fogDensity: 0.5,
    fogDistance: 400,
  },

  // ---- 后处理效果 ----
  postprocessing: {
    bloom: {
      strength: 0.9,         // v14: 增强辉光让画面更明亮
      radius: 0.5,           // v14: 更柔和的辉光扩散
      threshold: 0.32,       // v27.1: 进一步降低，让脉冲星触发泛光
    },
    vignette: {
      offset: 0.5,
      darkness: 0.15,        // v14: 降低暗角避免过暗
    },
    filmGrain: {             // v9.0: 可选胶片颗粒
      enabled: false,
      strength: 0.03,
    },
    // v13: 镜头光晕
    lensFlare: {
      enabled: true,
      brightness: 0.6,         // 光晕亮度
      fadeSpeed: 3.0,          // 淡入淡出速度
    },
    // v13: 景深
    dof: {
      enabled: true,
      focusDistance: 100,       // 默认对焦距离
      aperture: 0.02,          // 光圈大小
      maxBlur: 0.008,          // 最大模糊量
    },
    // v13: 运动模糊
    motionBlur: {
      enabled: true,
      intensity: 0.15,          // 模糊强度 (降低避免重影)
      samples: 5,              // 采样次数
      speedThreshold: 15.0,    // 速度阈值（低于此不模糊）
    },
  },

  // ---- 渲染器 ----
  renderer: {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    toneMappingExposure: 1.5, // v14: 提高曝光让整体更明亮
    contrast: 1.05,            // v14: 微调对比度
    saturation: 1.15,          // v14: 增强饱和度让色彩更鲜艳
  },

  // ---- 速度线（仅冲刺时出现，极简设计）----
  speedLines: {
    count: 400,               // v19.5: 适度增加，但集中边缘
    minRadius: 15.0,          // 更远离中心
    maxRadius: 70.0,          // 更大 = 屏幕边缘
    minLength: 4,
    maxLength: 16,
    zStart: -100,
    zEnd: -8,
    speedThreshold: 999,
    opacityTarget: 0.22,
    opacitySpeed: 0.3,
    moveFactor: 35,
    sprintExtraCount: 150,
  },

  // ---- 全局天体布局 ----
  celestialLayout: {
    masterSeedFn: () => Date.now(), // 基于时间的随机种子，每次刷新位置不同
    solarExclusion: 8000,           // 太阳系周围禁止生成区域
    bulgeExclusion: 5000,           // 银河核球周围禁止生成区域
    minBodyDistance: 3000,          // 各天体间最小间距
    maxRenderDistance: 150000,      // 超过此距离暂停更新（不重生）
  },

  // ---- 黑洞系统 ----
  blackhole: {
    count: 1,                   // 数量
    distFromCenterMin: 20000,   // 距银河中心最小距离
    distFromCenterMax: 40000,   // v26: 约束在旋臂半径1.1倍内
    eventHorizonRadius: 25,    // 事件视界半径
    accretionInnerRadius: 40,  // 吸积盘内半径
    accretionOuterRadius: 200, // 吸积盘外半径
    dangerRadius: 600,         // 危险区域半径
    pullRadius: 300,           // 引力影响半径
    pullStrength: 80,          // 引力强度
    jetLength: 400,            // 喷流长度
    absorbRadius: 80,          // 行星吸收半径
    // v11: 新增
    selfRotationSpeed: 1.5,    // 黑洞自转速度 (rad/s)
    gravityEnabled: true,      // 引力效果开关
    lensingStrength: 0.35,     // 引力透镜强度
    absorbParticleCount: 800,  // 吸收粒子数（增强）
    distorionRadius: 600,      // 屏幕扭曲生效半径
    infoDistance: 800,         // 靠近显示信息距离
    // v12: 吸收特效
    infallParticleCount: 2000, // 环境坠落粒子数
    infallRange: 400,          // 坠落粒子分布半径 (accretionOuterRadius*2)
    infallGravity: 2500,       // 坠落粒子引力常数 (v12-fix: 从800增到2500, 近处加速更剧烈)
    infallTangential: 0.12,    // 切向初速度系数 (v12-fix: 从0.6降到0.12, 以坠入为主)
    accretionInfallSpeed: 3.0, // 吸积盘内落速度 (v12-fix5: Kepler公式, 外缘~27秒走完)
    photonSphereRadius: 37.5,  // 光子球半径 (eventHorizonRadius*1.5)
    matterStreamCount: 6,      // 物质流线数
    matterStreamParticles: 80, // 每条流线粒子数
    tidalStretchFactor: 3.0,   // 潮汐拉伸倍数
    debrisCount: 40,           // 碎片喷射数量
  },

  // ---- 彗星系统（v27.6）----
  comets: {
    count: 4,                  // 标志性周期彗星数量
    showOrbitLines: false,     // 是否显示轨道线
    orbitLineOpacity: 0.15,    // 轨道线透明度
  },

  // ---- 脉冲星系统 ----
  pulsar: {
    count: 3,                  // 数量（分散在银河盘）
    distFromCenterMin: 10000,  // 距银河中心最小距离
    distFromCenterMax: 36000,  // v26: 约束在旋臂半径1.1倍内
    radius: 5,                 // 半径
    beamLength: 300,           // 光束长度
    rotationSpeed: 5,          // 旋转速度（弧度/秒）
    magneticTilt: 25,          // v27.5: 磁偏角（度），磁轴与自转轴夹角，实现灯塔效应
    color: { r: 0.5, g: 0.8, b: 1.0 },    // 颜色
    // v11: 新增
    beamSweepAngle: 0.25,      // 射束扫过触发角度 (cos阈值, ~15°)
    flashIntensity: 0.8,       // 屏幕闪光最大强度
    flashDecay: 4.0,           // 闪光衰减速度
    noiseDistance: 400,        // 噪点干扰生效距离
    maxNoiseIntensity: 0.5,    // 最大噪点强度
    infoDistance: 500,         // 靠近显示信息距离
  },

  // ---- 宇宙尘埃 ----
  cosmicDust: {
    count: 2500,               // v8.0: 平衡性能与视觉
    spread: 6000,              // 分布范围
    recenterDistance: 3000,    // 超出此距离重新居中
    // v11: 三层结构
    layers: [
      { count: 1000, spread: 6000, opacity: 0.08, speed: 0.3 },  // 远景
      { count: 1000, spread: 4000, opacity: 0.12, speed: 0.7 },  // 中景
      { count: 500,  spread: 1500, opacity: 0.20, speed: 1.5 },  // 近景
    ],
    turbulenceStrength: 0.5,   // 湍流扰动强度
    armDistribution: true,     // 是否沿旋臂分布
    armSpread: 0.25,           // 旋臂散布度
    speedLineThreshold: 30,    // 速度线划过触发速度
    speedLineStretch: 3.0,     // 速度线拉伸倍数
  },

  // ---- 全方向粒子流 ----
  particleFlow: {
    count: 3000,              // v19.3: 极简粒子，仅点缀运动感
    spread: 200,
    sprintColorBoost: 1.5,
    streakLength: 2.5,
  },

  // ---- 天体宏观运动控制 ----
  celestialMotion: {
    enabled: true,               // 全局天体运动总开关
    speedMultiplier: 1.0,        // 全局速度倍率
  },

  // ---- 后处理: 自定义效果 ----
  postEffects: {
    distortion: {
      enabled: true,
      lensingStrength: 0.35,     // 黑洞引力透镜强度
      lensingRadius: 0.25,       // 透镜影响屏幕范围 (0~0.5)
      gravityNoiseMax: 0.6,      // 脉冲星靠近最大噪点强度
    },
    flash: {
      enabled: true,
      maxIntensity: 0.8,         // 脉冲星闪光最大亮度
      decaySpeed: 4.0,           // 闪光衰减速度
    },
    nebulaFog: {
      enabled: true,
      maxDensity: 0.5,           // 星云内最大雾化
    },
  },

  // ---- 性能优化 ----
  performance: {
    lodDistances: [0, 800, 2000], // LOD 距离阈值
    adaptiveQuality: true,     // v8.0: 自适应画质
    minTargetFPS: 35,          // v8.0: 低于此FPS自动降质
    qualityDropThreshold: 3,   // v8.0: 持续低于阈值秒数
    warmupSeconds: 3,          // v8.0: 启动预热时间（期间不降质）
    maxTotalParticles: 200000, // 粒子总数上限
  },
};
