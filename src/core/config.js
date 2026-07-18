/**
 * 深空探索 - 全局配置
 * 集中管理所有可调参数
 */

export const config = {
  // ---- 相机系统 ----
  camera: {
    // 默认顶层参数（与 defaultMode='wide' 一致，避免首帧 FOV 跳变）
    fov: 75,
    near: 1,
    far: 200000,
    startPosition: { x: 7000, y: 3500, z: -28000 },

    // 双视角配置
    modes: {
      close: { // 近景沉浸：长焦、星球巨大
        fov: 25,
        near: 0.5,
        far: 50000,
        name: '近景探索',
      },
      wide: { // 广域巡游：宽视野、远裁剪 — 恢复原始经典FOV
        fov: 75,
        near: 1,
        far: 200000,
        name: '广域巡游',
      },
    },
  },

  // ---- 玩家控制 (v9.0: 惯性飞行系统) ----
  player: {
    // 默认模式
    defaultMode: 'wide', // 'close'=近景沉浸, 'wide'=广域巡游

    modes: {
      close: { // 近景探索：星球巨大、速度慢、精细操控
        accel: 60,              // 降低加速度，更有重型飞船感
        decelDamping: 0.94,
        maxSpeed: 15,           // 降低极速：保持加速度但上限低，让星球"飞很久都飞不完"
        sprintMultiplier: 5.0,  // 冲刺多倍补偿：仍可快速移动但需要主动 shift
        sprintFovBoost: 8,
        mouseSensitivity: 0.0015, // 降低鼠标速度，让精细操控更稳
        lookSmoothTime: 0.05,
        cameraShake: true,
        shakeAmplitude: 0.5,
        shakeFrequency: 8.0,
      },
      wide: { // 广域巡游：宽阔场景、高速移动
        accel: 200,
        decelDamping: 0.94,
        maxSpeed: 120,
        sprintMultiplier: 3.0,
        sprintFovBoost: 25,
        mouseSensitivity: 0.002,
        lookSmoothTime: 0.045,
        cameraShake: true,
        shakeAmplitude: 1.5,
        shakeFrequency: 10.0,
      },
    },

    // 兼容性：保留顶层字段，模式会覆盖它们
    accel: 200,
    decelDamping: 0.94,
    maxSpeed: 80,
    sprintMultiplier: 3.0,
    sprintFovBoost: 25,
    mouseSensitivity: 0.002,
    lookSmoothTime: 0.045,
    unadjustedMovement: true,
    proximitySlowdown: true,
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
    labelDistance: 3000,      // v25: 标签可见距离（超出隐藏，减少屏幕杂乱）
    hostStarRadius: 8,       // 宿主小恒星半径
  },

  // ---- 太阳系 ----
  solarSystem: {
    sunRadius: 120,
    timeScale: 0.5,
    sunLightIntensity: 3.0,
    sunLightRange: 25000,
    ambientIntensity: 0.05,
    labelMaxDistance: 6000,  // v25: 太阳系行星标签最大可见距离
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
      strength: 0.6,         // v-latest: 0.9→0.6，降低泛光强度，避免行星亮部被晕成发光体
      radius: 0.5,           // v14: 更柔和的辉光扩散
      threshold: 0.55,       // v-latest: 0.32→0.55，提高泛光阈值，只让真正高亮区域（太阳、恒星）触发Bloom
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
    toneMappingExposure: 0.9, // v-latest: 1.5→0.9，降低整体曝光，防止近距离行星表面过曝发白
    contrast: 1.0,            // v-latest: 重置为1.0，减少后处理对比度拉伸
    saturation: 1.05,         // v-latest: 1.15→1.05，轻微保留色彩，避免过度鲜艳
  },

  // ---- 速度线（仅冲刺时出现，极简设计）----
  // v26: 整体弱化 + 边缘化 + 单一冷色调，不与粒子流重复
  speedLines: {
    count: 280,               // 400 → 280，减少密度
    minRadius: 25.0,          // 15→25，更远离中心（中心清空）
    maxRadius: 80.0,          // 70→80，扩展到屏幕外圈
    minLength: 3,
    maxLength: 12,
    zStart: -120,
    zEnd: -10,
    speedThreshold: 999,
    opacityTarget: 0.16,      // 0.22→0.16，降低整体亮度
    opacitySpeed: 0.3,
    moveFactor: 35,
    sprintExtraCount: 80,     // 150→80
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

    // v29: Gargantua 光线追踪参数
    renderMode: 'raytrace',     // 'raytrace'=光线追踪, 'particles'=旧粒子系统
    particleDiskEnabled: false, // 旧粒子盘总开关（仅在 renderMode='particles' 时有效）
    raytrace: {
      enabled: true,            // 总开关
      steps: 200,               // 每像素测地线步数 (60-400, 越高越精细)
      enableDistance: 8000,     // raytrace 启用距离（需要主动探索才能发现黑洞）
      blendNear: 600,           // （保留，屏幕空间模式下不再使用世界距离 blend）
      blendFar: 6000,           // （保留）
      diskInner: 2.2,           // 吸积盘内缘 (RS 单位，留出更多空间让光子环显形)
      diskOuter: 12.0,          // 吸积盘外缘 (RS 单位，更宽的盘让多普勒更明显)
      dopplerMax: 2.6,          // 最大多普勒增强 (强化明暗两半对比)
      opacityNear: 0.95,        // 内盘不透明度
      opacityFar: 0.85,         // 外盘不透明度
      diskBrightness: 2.2,      // 盘面亮度
      starBrightness: 1.2,      // 星空亮度
      skyFloor: 0.06,           // 天光基底
      rotSpeed: 1.0,            // 盘面旋转速度
      sizeScale: 2.0,           // v29-fix: 视觉缩放（2.0 更平衡，避免过度压缩成色块）
      debug: 0,                 // 0=正常, 1-9=调试视图
    },
  },

  // ---- 彗星系统（v4.0: 梦幻科幻视觉升级）----
  comets: {
    count: 4,                  // 标志性周期彗星数量
    showOrbitLines: false,     // 是否显示轨道线
    orbitLineOpacity: 0.15,    // 轨道线透明度
    // v4.0: 全局视觉参数
    globalBreathSpeed: 0.55,   // 全局呼吸脉动速度 (约11.4s周期)
    burstInterval: 5.0,        // 爆发间隔基数 (秒)
    comaNoiseSpeed: 0.25,      // 彗发3D噪声流动速度
    tailWaveAmplitude: 1.0,    // 尾部波纹幅度倍率
    rainbowIntensity: 1.0,     // 彩虹色散强度倍率
    glowIntensity: 1.0,        // 整体辉光强度倍率
    // v-latest: 公转速度（UX 优先 — 让慢彗星也能被看见）
    // 真实彗星周期相差近 760 倍（恩克约3.3年 vs 海尔-波普约2500年）。若与行星用同一
    // 时间倍率，最慢彗星一圈需数小时，几乎不动。故对周期做指数压缩(指数<1)，在保留
    // “真实快慢顺序”的前提下把最慢彗星压到 orbitBaseSeconds 秒可见。轨道形状(a/e/i/ω)仍写实。
    orbitTimeScale: 1.0,        // 全局彗星公转速度倍率（>1 更快，<1 更慢）
    orbitPeriodCompress: 1 / 3, // 真实周期压缩指数：把 760 倍周期差压成可观赏范围
    orbitBaseSeconds: 90,       // 最慢彗星(海尔-波普)完整公转的视觉时长(秒)
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

  // ---- 行星碎石环系统（仅气态巨行星，基于天文事实）----
  planetRings: {
    enabled: true,
    // 参数以半径=50为基准，实际粒子数 = baseCount * (radius / 50)
    // 这样木星(r=65)比海王星(r=26)有更多粒子，比例合适
    gas: {
      enabled: true,
      baseCount: 180,       // 基准粒子数（半径50时），按半径等比例缩放
      innerScale: 1.6,      // 环内半径 = planetRadius * innerScale
      outerScale: 3.5,      // 环外半径 = planetRadius * outerScale
      minSize: 0.8,         // 单个碎石最小尺寸
      maxSize: 8,           // 单个碎石最大尺寸
      thickness: 0.6,       // 垂直厚度系数（相对于planetRadius）
      color: '#8a8070',     // 暖灰褐（尘埃+冰混合色）
    },
    // Kepler 差速旋转：内圈快、外圈慢
    orbitSpeedBase: 0.25,
  },

  // ---- 近处微尘层（尺度参照物，强化速度感和星球巨大感）----
  // v25: 数量大幅减少 + 圆形软点贴图 + 降低透明度，避免"方块脏点"视觉bug
  // v26: 冷蓝色调 + 偏边缘分布，与速度线/粒子流分层显示
  nearDust: {
    count: 40,            // 边缘分布数量
    range: 30,            // 相机前 8~30 单位
    size: 0.25,           // 缩小基础尺寸
    opacity: 0.08,        // 极低基础不透明度
    driftSpeed: 0.3,
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
  // v26: 数量大减 + 中心透明化 + 冷蓝调，避免和速度线视觉冲突
  particleFlow: {
    count: 1500,              // 3000 → 1500
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

  // ---- 跟踪视角 ----
  // 距离系数：跟踪时相机距天体 = radius × distanceFactor
  //   3.5 = 默认（天体占屏幕 ~35%，看清全貌+留白）
  //   2.0 = 近（占屏幕 ~60%）
  //   5.0 = 远（占屏幕 ~25%）
  // 改这个值可整体调整跟踪远近
  tracking: {
    distanceFactor: 3.5,      // 距离系数（半径的倍数）
    transitionDuration: 1.5,  // 进入/退出过渡时长（秒）
    dampingFactor: 0.08,      // OrbitControls 阻尼系数
    maxDistanceFactor: 50,    // 最大缩放距离 = 半径 × 50
  },
};

// ---- v25: 运行时配置安全校验（防止缺失字段导致 NaN 错误）----
(function sanitizeConfig() {
  const defaults = {
    camera: { fov: 75, near: 1, far: 200000 },
    player: { accel: 200, maxSpeed: 80, sprintMultiplier: 3.0, sprintFovBoost: 25, mouseSensitivity: 0.002 },
    postprocessing: { bloom: { strength: 0.9, radius: 0.5, threshold: 0.4 } },
    renderer: { contrast: 1.0, saturation: 1.0 },
  };

  function ensure(obj, path, fallback) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current[key] === undefined || current[key] === null) {
        // 找到缺失点，设置兜底
        let target = obj;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!target[keys[i]]) target[keys[i]] = {};
          target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = fallback;
        console.warn(`[Config] "${path}" 缺失，使用默认值:`, fallback);
        return;
      }
      current = current[key];
    }
  }

  for (const [section, fields] of Object.entries(defaults)) {
    for (const [key, val] of Object.entries(fields)) {
      ensure(config, `${section}.${key}`, val);
    }
  }
})();
