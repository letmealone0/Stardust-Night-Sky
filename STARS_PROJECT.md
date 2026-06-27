# 深空探索 (Deep Space Explorer) — 项目文档

> **项目**: `stars-project/` · **版本**: v7.0 · **最后更新**: 2026-06-27
>
> **一句话描述**: 基于 Three.js 3D 引擎的第一人称深空探索体验，WASD 移动 + 鼠标视角，
> 可探索真实太阳系（太阳+8行星+卫星+星环）、银河系背景、体积光线步进星云、宇宙尘埃、黑洞（含行星吸收）和脉冲星。

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
| **后处理** | EffectComposer (Bloom + OutputPass) |
| **色调映射** | ACES Filmic ToneMapping |
| **模块数** | 31 个（构建产物 ~143 KB gzip） |

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
│   │   ├── solarSystem.js      # 太阳系（太阳+8行星+卫星+星环+日冕）
│   │   ├── nebula.js           # 星云（体积光线步进 Raymarching + 三色渐变）
│   │   ├── speedlines.js       # 速度线（方向感知 LineSegments）
│   │   ├── particleFlow.js     # 全方向粒子流（垂直运动粒子反馈，新增）
│   │   ├── cosmicdust.js       # 宇宙尘埃（2000 粒子漂浮+跟随重居中+推开效果）
│   │   ├── blackhole.js        # 黑洞（事件视界/吸积盘湍流/喷流/引力/重生）
│   │   └── pulsar.js           # 脉冲星（中子星/双锥光束/快速旋转/重生）
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
       │    ├─ NebulaSystem      (4 星云, 体积 Raymarching, 三色渐变, 重生系统)
       │    ├─ SpeedLines        (相机子对象, 方向感知, 跟随视角)
       │    ├─ ParticleFlow      (3000 粒子, 全方向粒子流, 垂直运动反馈, 新增)
       │    ├─ CosmicDust        (2000 粒子, 跟随重居中, 移动推开效果)
       │    ├─ BlackHole         (事件视界 + 吸积盘湍流 + 喷流 + 引力 + 重生)
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

### objects/nebula.js
- **体积光线步进（Raymarching）**：立方体包围盒内逐采样点累积密度
- FBM 噪声（2 层标准 + 1 层 turbulence）创建有机丝絮形态
- 球形衰减 + 色彩渐变（主色 → 二次色随密度过渡）
- 自适应步数（6-24 步），相机位置转局部空间计算
- 脉冲缩放 + 缓慢自转

### objects/speedlines.js
- 300 条线段（`LineSegments`），白→蓝渐变
- 相机子对象（跟随视角旋转）
- 速度驱动透明度和显示

### objects/cosmicdust.js
- 2000 粒子球壳分布
- 正弦漂移动画（**v6.0: 预计算相位偏移**）
- 脉冲透明度（0.1 ~ 0.2）

### objects/blackhole.js（v6.0 新增，v6.1 增强）
- 事件视界（纯黑球体）
- 吸积盘（5000 粒子，内圈更密集更亮，外圈偏红暗）
- 双极喷流（400 粒子，脉冲透明度，更长更亮）
- 外层光晕（Shader 边缘发光 + 脉动，范围扩大）
- 引力拖拽效果（距离驱动，影响玩家移动，范围 200/强度 80）
- 危险等级系统（HUD 红色警告联动，危险半径 400）
- **行星吸收系统**（v6.1 新增）：检测距离 < 80 的行星，逐渐缩小 + 颜色偏红 + 螺旋粒子流 + 最终移除

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
    near: 1,                        // 近裁剪面（v6.3 加大，防穿模）
    far: 20000,                     // 远裁剪面（v6.2 加大）
    startPosition: { x:0, y:0, z:100 }
  },
  player: {
    moveSpeed: 50,                  // 基础移动速度
    sprintMultiplier: 4.0,          // 冲刺倍数
    sprintFovBoost: 15,             // 冲刺 FOV 增加量
    mouseSensitivity: 0.002,        // 鼠标灵敏度
    damping: 0.05                   // 移动阻尼
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
    count: 4,                       // 星云数
    scale: 1200,                    // 大小（v6.3 翻倍）
    opacity: 1.0,
    colors: [ /* 深紫/深蓝/暗红/青绿 */ ],
    respawnDistance: 5000, respawnMin: 2000, respawnMax: 4000
  },
  postprocessing: {
    bloom: {
      strength: 0.5,                // 辉光强度
      radius: 0.3,                  // 辉光半径
      threshold: 0.8                // 辉光阈值
    }
  },
  speedLines: {
    count: 300,                     // 线段数
    minRadius: 1.5, maxRadius: 13.5,// 分布半径
    minLength: 10, maxLength: 50,   // 线段长度
    speedThreshold: 2,              // 显示速度阈值
    opacityTarget: 0.7              // 最大透明度
  },
  blackhole: {                      // v6.0 新增，v6.3 加大
    eventHorizonRadius: 25,         // 事件视界半径（v6.3 加大）
    accretionInnerRadius: 40,       // 吸积盘内半径（v6.3 加大）
    accretionOuterRadius: 200,      // 吸积盘外半径（v6.3 加大）
    position: { x:800, y:50, z:-600 },
    dangerRadius: 600,              // 危险区域半径（v6.3 加大）
    pullRadius: 300,                // 引力影响半径（v6.3 加大）
    pullStrength: 80,               // 引力强度
    jetLength: 400,                 // 喷流长度（v6.3 加长）
    absorbRadius: 80,               // 行星吸收半径
    respawnDistance: 3000,           // 重生距离（v6.2 新增）
  },
  pulsar: {                         // v6.0 新增，v6.3 加大
    radius: 5,                      // 半径（v6.3 加大）
    beamLength: 300,                // 光束长度（v6.3 翻倍）
    rotationSpeed: 5,               // 旋转速度（弧度/秒）
    position: { x:-500, y:100, z:400 },
    color: { r:0.5, g:0.8, b:1.0 },
    respawnDistance: 3000,           // 重生距离（v6.2 新增）
  }
}
```

---

## 8. 已知问题与限制

### 已修复（v5.2）

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
| 脉冲星光束 | 使用锥形几何模拟，非真实体积光 |
| 星云体积渲染 | 光线步进 24 步，低端设备可能有性能压力 |
| 行星吸收 | 仅黑洞附近触发，不支持远程引力影响 |
| 太阳系比例 | 行星大小和轨道距离为艺术化缩放，非真实天文比例 |
| 行星纹理 | Canvas 2D 程序化生成，精度有限（1024×512） |
| 卫星数量 | 仅展示主要卫星（7 颗），未包含全部已知卫星 |

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
| 冲刺倍数 4.0 + FOV +15° | 高倍速配合视角扩展，营造星际穿越加速感 |
| Bloom 强度 0.8 / 阈值 0.6 | 过高导致闪烁，过低无效果 |
| 行星 LOD 三级（0/500/1200） | 配合更大行星半径，平衡视觉质量与性能 |
| Nebula 体积 Raymarching | 24 步 FBM 噪声，替代旧版球体堆叠，真实星云形态 |
| 黑洞行星吸收 | 距离 < 80 时触发，缩小+偏色+粒子流+移除，增强沉浸感 |
| 速度线用 LineSegments | Points 效果差，线段更有速度感 |

### 可扩展方向

- [x] 黑洞天体（v6.0 已实现：事件视界/吸积盘/喷流/引力效果）
- [x] 脉冲星（v6.0 已实现：中子星/双锥光束/快速旋转）
- [ ] 行星交互（靠近着陆）
- [ ] 音效 / 背景音乐
- [ ] 位置保存 / 进度系统
- [ ] 虫洞 / 传送系统
- [ ] 小行星带（InstancedMesh）
- [ ] 任务系统 / 发现记录
- [ ] 恒星系统（多星相互绕转）
- [ ] 彗星 / 流星雨

---

## 10. 版本历史

| 版本 | 日期 | 核心变更 |
|------|------|----------|
| v1.0 | 2026-06 | 初始单文件 HTML，基础粒子拖尾 |
| v2.0 | 2026-06 | 自定义光标、三层视差星空、星云、additive blending |
| v3.0 | 2026-06 | 相机平移、海拔系统、银河带、太空模式、UI 指示器 |
| v4.0 | 2026-06-10 | 迁移到 Vite 模块化架构、行星天体、流星彗星、贝塞尔拖尾 |
| v4.1 | 2026-06-14 | 性能优化（空间哈希、辉光缓存、dt 帧率无关）；视觉增强 |
| v5.0 | 2026-06-22 | 迁移到 Three.js 3D；第一人称控制；8行星、8000+星星、体积星云；无边界探索 |
| v5.1 | 2026-06-22 | 修复 Ctrl 闪退；禁用后处理解决闪烁；添加速度线系统 |
| v5.2 | 2026-06-25 | **Bug 修复**（7项）：window.engine null、方向 NaN、noise 置换表、dispose 清理等；**性能**（4项）：Planet LOD、Nebula 几何合并、Resize 节流、setAnimationLoop；**画面**（8项）：Bloom 管线重启用、LineSegments 速度线、OBAFGKM 星色、银河盘、程序化纹理、Rayleigh 大气层、宇宙尘埃、独立亮星闪烁；**代码质量**（4项）：配置校验、输入合并、参数化、优雅降级 |
| **v6.0** | **2026-06-26** | **Bug 修复**（3项）：亮星颜色衰减（GPU Shader 修复）、Scene null 安全检查、冰行星纹理性能；**性能优化**（3项）：亮星闪烁迁移到 GPU、宇宙尘埃预计算相位、冰行星 ImageData 批量写入；**新功能**（2项）：黑洞系统（事件视界/吸积盘/喷流/引力拖拽/危险区域）、脉冲星系统（中子星/双锥光束/快速旋转）；**画面增强**（3项）：跃迁特效（CSS 光晕+扫描线）、黑洞危险区域红色警告、准星脉冲动画+角标设计；**代码结构**（4项）：Camera/Player dispose 完整、toneMapping 统一管理、移除未使用 maxFPS 配置、HUD 危险等级接口 |
| **v6.1** | **2026-06-26** | **Bug 修复**（5项）：星云坐标空间不匹配（世界/局部空间统一）、玩家移动双重 delta（帧率无关修复）、阻尼帧率相关（改指数衰减）、黑洞每帧 new Vector3（复用优化）、速度线每帧多余 color.needsUpdate；**性能优化**（5项）：HUD DOM 引用缓存、速度线颜色按需更新、暂停时 camera uniform 仍更新、行星距离裁剪（>2000 跳过）、黑洞 addScaledVector 替代 multiplyScalar；**新功能**（3项）：星云体积光线步进（Raymarching + FBM）、黑洞行星吸收系统（缩小+偏色+粒子流+移除）、冲刺 FOV 扩展效果（+15°平滑过渡）；**画面增强**（4项）：冲刺倍数 2.5→4.0、跃迁 CSS 脉冲动画、吸积盘 5000 粒子+内圈高亮、HUD 冲刺 WARP 指示器；**操控改进**（2项）：下降键 Ctrl→C（防浏览器冲突）、行星半径 5-30→10-60+近处大行星 |
| **v6.2** | **2026-06-27** | **新功能**：距离驱动的星体重生系统（行星/星云/黑洞/脉冲星超出距离自动在新位置重生）；宇宙尘埃相机跟随重居中；确定性随机种子（基于坐标哈希）；**改进**：移除硬编码位置，全部随机球壳分布；加大分布范围（星空 5000→10000，尘埃 4000→6000）；camera far 10000→20000 |
| **v6.3** | **2026-06-27** | **巨物感增强**：行星半径 10-60→40-200；星云 scale 600→1200；黑洞事件视界 15→25、吸积盘外径 100→200、喷流 250→400；脉冲星半径 3→5、光束 150→300；吸积盘粒子 5000→8000、喷流粒子 400→600；脉冲星光束 Shader 参数 uniform 化；camera.near 0.1→1；LOD 距离 0/500/1200→0/800/2000 |
| **v6.4** | **2026-06-27** | **新功能**：太阳系系统（太阳+8行星+卫星+星环）；太阳 Shader 程序化等离子体纹理（日斑/湍流/光晕）；8 行星 Canvas 2D + 3D FBM 噪声真实纹理（地球海洋大陆/木星大红斑/土星环卡西尼缝等）；7 颗卫星（月球/木卫一~四/土卫六/土卫二）；土星环+天王星环；轨道线；时间缩放（1秒≈0.5天）；**改进**：随机行星数 8→4（太阳系已有 8 颗）；通用补光减弱（太阳为独立光源） |
| **v7.0** | **2026-06-27** | **Bug 修复**（3项）：Delta Clamping 防大帧跳跃、PointerLock 中断时按键状态重置、冲刺 FOV 过渡改用平滑 sprintFactor；**新功能**（3项）：全方向粒子流系统（3000 粒子跟随相机，垂直运动粒子反馈）、星体防重叠系统（空间距离检测工具 + 各系统集成）、太阳日冕效果（外层辉光层 + 脉动动画）；**银河系重写**：对数螺旋臂（4 条旋臂 + 尘埃带）、核心暖黄→旋臂蓝白→外层暗红颜色渐变、GPU 驱动银河自转动画、软圆形粒子替代方形像素、星星多频率叠加闪烁；**运动效果增强**：方向感知速度线系统（根据移动方向旋转线段，垂直运动有粒子反馈）、宇宙尘埃移动推开效果（近处粒子被推开）、冲刺因子平滑过渡（sprintFactor 0~1）；**视觉增强**：吸积盘 Shader 湍流扰动（噪声驱动旋转偏移）、星云三色渐变 + 丝絮结构、星云更柔和的球形衰减曲线；**架构改进**：新增 `src/utils/spatial.js`（空间检测工具）、新增 `src/objects/particleFlow.js`（粒子流系统）、场景系统支持速度向量传递 |
