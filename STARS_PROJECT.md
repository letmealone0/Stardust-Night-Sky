# 深空探索 (Deep Space Explorer) — 项目文档

> **项目**: `stars-project/` 
>
> **一句话描述**: 基于 Three.js 3D 引擎的第一人称深空探索体验，WASD 移动 + 鼠标视角，
> 可探索真实太阳系（太阳+8行星+卫星+星环）、银河系背景、多层粒子系统星云（含暗尘埃+虚拟光源+纤维噪声）、宇宙尘埃、黑洞（橙黄吸积盘+螺旋坠落+行星吸收+引力透镜）和脉冲星。

---

## 目录

1. [快速上手](#1-快速上手)
2. [操作说明](#2-操作说明)
3. [技术栈](#3-技术栈)
4. [项目结构](#4-项目结构)
5. [架构流程](#5-架构流程)
6. [模块说明](#6-模块说明)
7. [配置参数](#7-配置参数)
8. [已知问题与限制](#8-已知问题与限制)
9. [开发指南](#9-开发指南)
10. [版本历史](#10-版本历史)

---

## 1. 快速上手

### 本地开发

```bash
cd d:\code_with_AI\web_test\stars-project
npm install          # 首次：根据 package.json 安装依赖
npm run dev          # → http://localhost:3000
npm run build        # → dist/（生产构建）
npm run preview      # → 预览构建
```

构建产物 `dist/` 可部署到 Vercel / Netlify / GitHub Pages。

### 从 Git 仓库重建

本仓库 **不提交** `dist/` 和 `node_modules/`，clone 后只需两步即可运行：

```bash
git clone <仓库地址>
cd stars-project
npm install          # 生成 node_modules/
npm run dev          # 启动开发服务器，浏览器自动打开
```

如需生产构建：

```bash
npm run build        # 生成 dist/（纯静态文件，可直接部署）
npm run preview      # 本地预览构建结果
```

### 为什么 dist/ 和 node_modules/ 不提交 Git

| 目录 | 不提交原因 |
|------|-----------|
| `node_modules/` | npm 依赖（数百 MB），可通过 `package.json` + `npm install` 完整重建 |
| `dist/` | Vite 构建产物，由 `npm run build` 自动生成，内容可由源码 100% 还原 |

`.gitignore` 已配置排除这两个目录。提交源码和 `package.json` 即可保证任何人能在本地重建完整的网页。

---

## 2. 操作说明

| 按键 | 功能 |
|------|------|
| **W / S** | 前进 / 后退 |
| **A / D** | 左移 / 右移 |
| **空格** | 上升 |
| **Shift** | 冲刺（4× 速度 + FOV 扩展 + 跃迁特效） |
| **C** | 下降 |
| **鼠标** | 控制视角 |
| **点击 / ESC** | 锁定 / 解锁鼠标 |

> **首次进入**：加载完成后点击屏幕锁定鼠标，WASD 移动，Shift 冲刺。

---

## 3. 技术栈

| 项目 | 说明 |
|------|------|
| **渲染引擎** | Three.js v0.184.0 |
| **构建工具** | Vite 6.x |
| **语言** | JavaScript (ES Modules) |
| **后处理** | EffectComposer (Bloom + Vignette + 引力透镜 + 色差 + 动态模糊) |
| **色调映射** | ACES Filmic ToneMapping |
| **模块数** | 32 个源文件（构建产物 ~145 KB gzip） |

---

## 4. 项目结构

```
stars-project/
├── index.html                  # 入口 HTML
├── package.json                # 依赖：three, vite
├── vite.config.js              # Vite 配置（port: 3000）
│
├── src/
│   ├── main.js                 # 入口：初始化 Engine，启动循环
│   │
│   ├── core/
│   │   ├── engine.js           # 引擎核心：子系统初始化 + 渲染循环
│   │   ├── scene.js            # 场景管理：创建/销毁所有 3D 对象
│   │   ├── camera.js           # PerspectiveCamera 封装
│   │   ├── renderer.js         # WebGLRenderer 封装
│   │   └── config.js           # 全局配置（所有可调参数）
│   │
│   ├── controls/
│   │   ├── player.js           # 玩家控制器（WASD + PointerLock）
│   │   └── input.js            # [废弃] 已合并到 player.js
│   │
│   ├── objects/
│   │   ├── stars.js            # 星空 + 银河系（对数螺旋臂 + GPU 自转）+ 亮星闪烁
│   │   ├── planets.js          # 随机行星（纹理/大气层/环/LOD/公转/重生/防重叠）
│   │   ├── planetTextures.js   # 行星 Canvas 2D 程序化纹理生成
│   │   ├── solarSystem.js      # 太阳系（太阳+8行星+卫星+星环+日冕+标签面板）
│   │   ├── nebula.js           # 星云（5层粒子: 暗尘+中层暗纹+发光层, CPU FBM过滤, 虚拟光源, 纤维噪声）
│   │   ├── speedlines.js       # 冲刺速度线（400线段, 屏幕边缘分布, 冷蓝色调）
│   │   ├── particleFlow.js     # 全方向粒子流（3000粒子, 相对运动方向反馈）
│   │   ├── cosmicdust.js       # 宇宙尘埃（2500粒子, 3层结构, 跟随重居中）
│   │   ├── blackhole.js        # 黑洞（橙黄吸积盘+螺旋坠落+光子环+喷流+引力透镜+行星吸收）
│   │   ├── pulsar.js           # 脉冲星（中子星/双锥光束/快速旋转/重生）
│   │   ├── lensFlare.js        # 镜头光晕（对着亮源时的光学耀斑）
│   │   └── starGlow.js         # 亮星辉光（ShaderMaterial 光晕）
│   │
│   ├── postprocessing/
│   │   └── composer.js         # EffectComposer（Bloom + OutputPass）
│   │
│   ├── ui/
│   │   └── hud.js              # HUD（准星/FPS/速度/位置/消息）
│   │
│   └── utils/
│       ├── math.js             # 数学工具（lerp/clamp/noise）
│       ├── random.js           # 随机工具（range/color/vector3）
│       ├── seededRandom.js     # 确定性随机数（种子哈希）
│       ├── noise.js            # 噪声工具（2D/3D值噪声/FBM/turbulence）
│       └── spatial.js          # 空间距离检测（防重叠，新增）
│
└── dist/                       # 构建输出
```

---

## 5. 架构流程

```
main.js
  └─ new Engine()
       ├─ CameraController  ─→  PerspectiveCamera
       ├─ SceneManager
       │    ├─ StarField         (8000 星 + 螺旋臂银河盘 + 尘埃带 + 亮星 GPU 闪烁)
       │    ├─ PlanetSystem      (4 额外随机行星, LOD, 重生系统, 防重叠)
       │    ├─ SolarSystem       (太阳 + 8 行星 + 卫星 + 星环 + 日冕, 真实纹理)
       │    ├─ NebulaSystem      (3 星云, 5层粒子系统, CPU噪声过滤, MultiplyBlending暗尘, 虚拟光源, LOD)
       │    ├─ SpeedLines        (400 线段, 冲刺时屏幕边缘, 冷蓝色调, 速度驱动)
       │    ├─ ParticleFlow      (3000 粒子, 全方向粒子流, 速度驱动色温+拖尾)
       │    ├─ CosmicDust        (2500 粒子, 3层结构, 跟随重居中, 湍流扰动)
       │    ├─ BlackHole         (橙黄吸积盘 + 螺旋坠落 + 光子环 + 双极喷流 + 引力透镜 + 行星吸收)
       │    └─ Pulsar            (中子星 + 双锥光束 + 重生)
       ├─ RendererManager    ─→  WebGLRenderer
       ├─ PlayerController   ─→  PointerLockControls + 键盘
       ├─ PostProcessing     ─→  EffectComposer
       │    ├─ RenderPass
       │    ├─ UnrealBloomPass
       │    └─ OutputPass (toneMapping + sRGB)
       └─ HUD                   (DOM 元素覆盖层)

渲染循环 (engine.animate):
  player.update(delta)
  → scene.update(delta, elapsed, speed, velocity)
  → hud.update(delta)
  → postprocessing.render()
```

**关键初始化顺序**: Camera → Scene (接收 camera) → Renderer → Player → PostProcessing → HUD

---

## 6. 模块说明

### core/engine.js
- `init()`: 按顺序创建所有子系统，校验 config
- `animate()`: 渲染循环（`setAnimationLoop`），FPS 统计，HUD 更新
- `onResize()`: rAF 节流防抖

### core/scene.js
- `init(camera)`: 逐个初始化对象，失败不阻断整体（try-catch 优雅降级）
- `update(delta, elapsed, speed)`: 转发给所有子对象
- `dispose()`: 从场景 `remove` + 释放 GPU 资源

### controls/player.js
- PointerLock 鼠标锁定/解锁
- WASD + 箭头键 + Space/Shift/C 移动
- **Shift = 冲刺（4× 速度 + FOV 扩展）, C = 下降**
- 冲刺时 FOV 平滑扩展（+15°，指数衰减过渡）
- 帧率无关运动（速度不含 delta，移动时统一乘 delta）
- 指数衰减阻尼（`pow(1-damp, delta*60)`）

### objects/stars.js
- 3 层星空（4000 + 2500 + 1500 颗，Points 渲染）
- OBAFGKM 光谱颜色分布
- 银河螺旋盘（4000 星点，密集中心）
- 50 颗亮星独立频率/相位闪烁（**v6.0: GPU Shader 计算**）

### objects/planets.js
- 4 颗额外随机行星：岩石 / 气态 / 冰 / 熔岩
- Canvas 2D 程序化纹理（陨石坑、条纹、裂纹、熔岩流）
- Rayleigh + Mie 散射大气层 Shader
- **LOD 系统**：64 / 32 / 16 段，距离 0 / 800 / 2000 切换
- 自转 + 公转动画 + 距离重生系统

### objects/solarSystem.js（v6.4 新增）
- **太阳**：Shader 程序化等离子体纹理（日斑/湍流/光晕）
- **8 大行星**：水星/金星/地球/火星/木星/土星/天王星/海王星
  - Canvas 2D + 3D FBM 噪声程序化纹理（1024×512）
  - 地球：海洋+大陆+冰盖（高度图着色）
  - 木星：横向条带+大红斑
  - 土星：条带+华丽星环（含卡西尼缝）
  - 各行星独立轴倾角、公转/自转周期
- **卫星**：月球、木卫一~四、土卫六/土卫二
- **星环**：土星环（程序化渐变+噪点+卡西尼缝）、天王星环
- **轨道线**：半透明圆形轨道参考线
- **时间缩放**：1 秒 ≈ 0.5 天（一年约 730 秒）

### objects/nebula.js（v23 摄影级星云）
- **5 层 Points 粒子系统**：dustBg(暗尘) → outer(外层气) → dustMid(中层暗纹) → mid(中层气) → inner(内层气)
- **CPU 端 FBM 噪声过滤**：仅在高噪声密度区放置粒子，源头打破球形
- **MultiplyBlending 暗尘**：dustBg 和 dustMid 使用乘法混合，真实吸光遮挡背景星光
- **统一轴向拉伸 + 各向异性纤维噪声**：Shader 端沿拉伸轴制造丝缕纹理
- **2 个内部虚拟光源**：距离平方反比衰减 + 缓慢漂移 + 呼吸脉动，打造立体感
- **5 色阶渐变**：蓝紫→品红→灰褐（宇宙尘埃色）→粉橙→暗红，噪声扰动色彩混合
- **LOD 三级平滑淡出**：drawRange + uLodFade，远距离自然过渡
- **FBM 湍流替代 sin/cos**：低频平滑位移，模拟自然气体流动
- 宏观自转（×delta 帧率解耦）+ 分层差异化湍流速度

### objects/speedlines.js（v19 优化）
- **400 条线段**（`LineSegments`），仅冲刺时可见（速度 > 60% 冲刺速度）
- **屏幕边缘分布**（sqrt 分布），短线段（4-16 单位），低透明度（0.22）
- 冷蓝色调，速度驱动显隐

### objects/cosmicdust.js（v11 三层结构）
- **2500 粒子**，3 层分布（远景 1000 + 中景 1000 + 近景 500）
- 不同透明度（0.08 / 0.12 / 0.20）和漂移速度
- 超出范围自动重居中，湍流扰动，沿银河旋臂分布

### objects/blackhole.js（v14 真实物理黑洞）
- **事件视界**：纯黑不透明球体，绝对无反射
- **光子环**：TorusGeometry 极细亮环（rim^8），暖白色，非球面发光
- **吸积盘**：10000 粒子，橙黄温度梯度（内白→中金→外暗红），35°倾斜薄盘
  - Kepler 差速旋转（内圈 5-8 倍速），螺旋内落，近内缘粒子消失
  - 顶点着色器引力弯折（远侧半盘 Y 轴抬升，模拟环绕视觉）
  - 片元着色器旋转 2D 噪声 ±20% 亮度扰动（湍流热斑）
- **双极喷流**：1200 粒子，暖色（白→金→暗橙），高准直度，轴向周期亮斑节点，流速 ×2.5
- **螺旋坠落粒子**：2000 粒子，径向内落 + 切向旋转，近心更快更亮更小
- **引力透镜**：平方反比衰减，中心强外围自然减弱
- **行星吸收 + 碎片喷射**：潮汐拉伸 + 颜色偏红 + 螺旋粒子流 + 完全移除 + 吸积盘亮度脉冲
- **轴向统一**：光子环+吸积盘+喷流挂载同一 `diskContainer`，喷流 ⊥ 盘面
- 所有动画 ×delta 帧率解耦

### objects/pulsar.js（v6.0 新增）
- 中子星本体（Shader 高亮球体 + 核心发光 + 边缘光晕）
- 双锥光束（锥形几何 + Shader 脉冲衰减）
- 快速自转（5 弧度/秒）

### postprocessing/composer.js
- `RenderPass → UnrealBloomPass → OutputPass`
- ACESFilmic toneMapping（修复闪烁的核心）

### ui/hud.js
- DOM 元素覆盖层（准星/FPS/速度/位置/消息/操作提示）
- SVG 脉冲准星（外圈呼吸动画 + 角标 + 发光滤镜）
- 跃迁特效（CSS 光晕叠加层，冲刺时触发）
- 黑洞危险警告（红色径向渐变 + 闪烁文字）
- FPS 颜色动态（绿/黄/红三档）
- 扫描线覆盖层（全屏半透明条纹）

---

## 7. 配置参数

所有可调参数在 `src/core/config.js`：

```javascript
{
  camera: {
    fov: 75,                        // 视野角度
    near: 1,                        // 近裁剪面
    far: 200000,                    // 远裁剪面（v16 加大，探索更远）
    startPosition: { x:37500, y:1200, z:-28500 } // 远离太阳，可观地球
  },
  player: {
    accel: 200,                     // 线性加速度 (单位/s²)
    decelDamping: 0.94,             // 松键阻尼（≈3秒衰减到1%）
    maxSpeed: 80,                   // 普通模式最大速度
    sprintMultiplier: 3.0,          // 冲刺倍数 (maxSpeed × 3 = 240)
    sprintFovBoost: 25,             // 冲刺 FOV 增量 (75+25=100)
    mouseSensitivity: 0.002,        // 鼠标灵敏度
    proximitySlowdown: true,        // 接近行星自动限速
    cameraShake: true,              // 镜头抖动
  },
  stars: {
    count: 8000,                    // 总星星数
    spread: 10000,                  // 分布半径（v6.2 加大）
    layers: [ /* 三层星空 */ ]
  },
  planets: {                        // 额外随机行星
    count: 4,                       // 数量（v6.4 减少，太阳系已有 8 颗）
    minRadius: 40, maxRadius: 200,  // 半径范围（v6.3 加大）
    spread: 3000, respawnDistance: 2500
  },
  solarSystem: {                    // 太阳系（v6.4 新增）
    sunRadius: 80,                  // 太阳半径
    timeScale: 0.5,                 // 时间缩放（每秒≈0.5天）
  },
  nebula: {
    count: 3,                          // 星云数（emission/reflection/dark）
    scale: 2000,                       // 粒子云团范围
    respawnDistance: 10000,            // 超出重生
    respawnMin: 2500, respawnMax: 7000,
    typeColors: {                      // 三类星云配色
      emission:    { r:0.42, g:0.10, b:0.55 },
      reflection:  { r:0.10, g:0.20, b:0.60 },
      dark:        { r:0.04, g:0.03, b:0.07 },
    },
    fogDensity: 0.5, fogDistance: 400,  // 进入星云雾效
  },
  postprocessing: {
    bloom: {
      strength: 0.9,                   // 辉光强度（v14 增强）
      radius: 0.5,                     // 辉光扩散
      threshold: 0.4,                  // 辉光阈值（v14 降低）
    },
    vignette: { offset:0.5, darkness:0.15 },
    lensFlare: { enabled:true, brightness:0.6 },
    dof: { enabled:true, focusDistance:100 },
  },
  speedLines: {
    count: 400,                        // 线段数
    minRadius: 15, maxRadius: 70,      // 屏幕边缘分布
    minLength: 4, maxLength: 16,       // 短线段
    speedThreshold: 999,               // 仅冲刺可见
    opacityTarget: 0.22,               // 低透明度
  },
  particleFlow: {
    count: 3000, spread: 200,          // 全方向粒子流
    streakLength: 2.5,
  },
  cosmicDust: {
    count: 2500, spread: 6000,         // 3 层结构
    recenterDistance: 3000,
  },
  blackhole: {                         // v14 持续增强
    eventHorizonRadius: 25,            // 事件视界半径
    accretionInnerRadius: 40,          // 吸积盘内半径
    accretionOuterRadius: 200,         // 吸积盘外半径
    position: { x:800, y:50, z:-600 },
    dangerRadius: 600,                 // 危险区域半径
    pullRadius: 300,                   // 引力影响半径
    pullStrength: 80,                  // 引力强度
    jetLength: 400,                    // 喷流长度（实际 ×1.5 渲染）
    absorbRadius: 80,                  // 行星吸收半径
    respawnDistance: 3000, respawnMin: 800, respawnMax: 2000,
    selfRotationSpeed: 1.5,            // 黑洞自转速度 (rad/s)
    gravityEnabled: true,              // 引力效果开关
    lensingStrength: 0.35,             // 引力透镜强度
    distorionRadius: 600,              // 屏幕扭曲生效半径
    infallParticleCount: 2000,         // 环境坠落粒子数
    infallRange: 400,                  // 坠落粒子分布半径
    infallGravity: 2500,               // 坠落粒子引力常数
    accretionInfallSpeed: 3.0,         // 吸积盘内落速度
    photonSphereRadius: 37.5,          // 光子球半径 (ehR×1.5)
    matterStreamCount: 6,              // 物质流线数
    matterStreamParticles: 80,         // 每条流线粒子数
    tidalStretchFactor: 3.0,           // 潮汐拉伸倍数
    debrisCount: 40,                   // 碎片喷射数量
  },
  pulsar: {
    radius: 5,                         // 中子星半径
    beamLength: 300,                   // 光束长度
    rotationSpeed: 5,                  // 旋转速度（弧度/秒）
    position: { x:-500, y:100, z:400 },
    color: { r:0.5, g:0.8, b:1.0 },
    respawnDistance: 3000,
  }
}
```

---

## 8. 已知问题与限制

### 已修复（早期版本）

| 问题 | 修复 |
|------|------|
| `window.engine` 永远 null | 移入 `init()` 赋值 |
| 零方向向量 normalize → NaN | `lengthSq() > 0` 检查 |
| `noise()` 每次重建置换表 | 模块级常量 |
| `dispose()` 未 scene.remove | 传入 scene 参数 |
| 后处理黑白闪烁 | 添加 OutputPass + ACESFilmic |
| Ctrl+方向键闪退 | Shift 改为冲刺键，Ctrl 仅做下降 |

### 当前限制

| 限制 | 说明 |
|------|------|
| 脉冲星光束 | 使用锥形几何 + Shader 模拟，非真实体积光 |
| 星云渲染 | 多层 Points 粒子系统，非体积 Raymarching；约 28500 粒子/团，3 团共 ~85k 粒子 |
| 行星吸收 | 仅黑洞附近触发，不支持远程引力影响 |
| 太阳系比例 | 行星大小和轨道距离为艺术化缩放，非真实天文比例 |
| 行星纹理 | Canvas 2D 程序化生成，精度有限（1024×512） |
| 卫星数量 | 仅展示主要卫星（7 颗），未包含全部已知卫星 |
| 多渲染目标 | 后处理使用 EffectComposer，约 5-6 个纹理采样/帧 |
| Shader 兼容性 | 使用 GLSL ES 1.0（Three.js ShaderMaterial），移动端可能不支持某些特性 |

---

## 9. 开发指南

### 添加新 3D 对象

1. `src/objects/xxx.js` 创建模块
2. `src/core/config.js` 添加可调参数
3. `src/core/scene.js` — `init()` 中创建，`update()` 中转发，`dispose()` 中清理

### 性能优化备忘

- draw call 目标 < 100（当前约 15-20）
- 行星用 LOD（64/32/16 自动切换）
- 粒子用 `Points` 而非 `Mesh`
- 几何合并用 `mergeBufferGeometries`
- 重复对象用 `InstancedMesh`
- 所有 `dispose()` 必须从 scene 移除 + 释放 GPU 资源

### 后处理配置注意事项

- **必须有 OutputPass** 作为链的最后一环（负责 toneMapping + sRGB）
- renderer 设置 `ACESFilmicToneMapping`
- `emissiveIntensity > 1` 的材质会触发 Bloom（可用 `toneMapped: false` 排除）
- 如果出现黑白闪烁，优先检查 OutputPass 是否存在

### 关键设计决策

| 决策 | 原因 |
|------|------|
| 下降用 C 而非 Ctrl | 浏览器 Ctrl+W/Ctrl+方向键无法完全拦截 |
| 冲刺倍数 3.0 + FOV +25° | 高倍速配合视角扩展，营造星际穿越加速感 |
| Bloom 强度 0.9 / 阈值 0.4 | 增强辉光让更多物体发光，画面更明亮 |
| 行星 LOD 三级（64/32/16） | 距离 0/800/2000 切换，平衡视觉质量与性能 |
| Nebula 多层粒子系统 | CPU FBM 过滤 + MultiplyBlending 暗尘 + ShaderMaterial 虚拟光源，替代旧版 Raymarching |
| 黑洞橙黄吸积盘 | 内白→中金→外暗红温度梯度，Torus 光子环，螺旋坠落粒子，符合物理直觉 |
| 速度线冲刺专用 | sqrt 边缘分布，冷蓝色调，仅冲刺可见，低成本速度感 |
| 全方向粒子流 | scene-attached Group 跟随相机同步，速度驱动色温+拖尾长度 |

## 10. 版本历史

本项目采用 Git 进行版本控制，所有变更均以提交记录为准。当前主要子系统版本：

| 子系统 | 版本 | 关键特性 |
|--------|------|----------|
| **Nebula** | v23 | 5 层粒子系统，CPU FBM 过滤，MultiplyBlending 暗尘，虚拟光源，各向异性纤维噪声，LOD 平滑淡出 |
| **BlackHole** | v14 | 橙黄吸积盘，Torus 光子环，引力弯折，亮度扰动，喷流准直+节点亮斑，透镜平方反比衰减 |
| **ParticleFlow** | v19 | 全方向粒子流，速度驱动色温+拖尾 |
| **SpeedLines** | v19 | 400 线段冲刺专用，屏幕边缘冷蓝 |
| **Stars** | v14 | 银河系 GPU 差速自转，OBAFGKM 光谱 |
| **Planets** | v19.7 | 随机轨道+公转，防重叠，标签面板 |
| **SolarSystem** | v19.6 | 标签暗底+文字描边，接近信息面板 |
| **Engine** | v19.5 | 惯性飞行，FPS 自适应降质，世界速度混合 |
| **PostProcessing** | v19.5 | 动态模糊，引力透镜，色差，暗角，Bloom |

详细变更请通过 Git 查看：

```bash
git log --oneline              # 简明提交历史
git log --stat                 # 含文件变更统计
git log -p -- <文件路径>        # 查看某文件的具体改动
```

