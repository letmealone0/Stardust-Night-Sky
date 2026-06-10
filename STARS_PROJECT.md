# 星尘夜空 (Stardust Night Sky) — 项目文档

> **项目**: `stars-project/` · **版本**: v4.0 · **最后更新**: 2026-06-10
>
> Vite + ES Modules 模块化架构的交互式星空网页。
> 粒子拖尾、相机平移、海拔高度、行星天体、流星彗星、贝塞尔平滑拖尾。

---

## 目录

1. [项目结构](#1-项目结构)
2. [技术栈](#2-技术栈)
3. [启动与构建](#3-启动与构建)
4. [模块职责与数据流](#4-模块职责与数据流)
5. [渲染层级架构](#5-渲染层级架构)
6. [核心系统详解](#6-核心系统详解)
   - [6.1 高度/海拔系统](#61-高度海拔系统)
   - [6.2 相机平移系统](#62-相机平移系统)
   - [6.3 背景星层](#63-背景星层)
   - [6.4 大气渲染](#64-大气渲染)
   - [6.5 银河带](#65-银河带)
   - [6.6 星云](#66-星云)
   - [6.7 行星/月球](#67-行星月球-v40-新增)
   - [6.8 流星/彗星](#68-流星彗星-v40-新增)
   - [6.9 粒子系统](#69-粒子系统含贝塞尔优化)
   - [6.10 星座连线](#610-星座连线)
   - [6.11 自定义光标](#611-自定义光标)
   - [6.12 UI 叠加层](#612-ui-叠加层)
7. [全局状态变量](#7-全局状态变量)
8. [工具函数](#8-工具函数)
9. [性能参数](#9-性能参数)
10. [后续开发指南](#10-后续开发指南)
11. [版本历史](#11-版本历史)

---

## 1. 项目结构

```
stars-project/
├── index.html                  # 入口 HTML（极简，只挂 canvas + UI DOM）
├── package.json                # 依赖：vite
├── vite.config.js              # Vite 配置（端口 3000，自动打开浏览器）
│
├── src/
│   ├── main.js                 # 入口：初始化所有模块，启动渲染循环
│   │
│   ├── core/
│   │   ├── state.js            # 全局状态单例（所有模块共享）
│   │   └── canvas.js           # Canvas 尺寸管理、RAF 循环调度
│   │
│   ├── systems/
│   │   ├── altitude.js         # 海拔计算、太空判定、非线性映射
│   │   ├── camera.js           # 相机平移、弹性回中、worldToScreen
│   │   ├── background.js       # 3层视差星空 + 2层太空密星
│   │   ├── atmosphere.js       # 大气渐变 + 地平线暖光
│   │   ├── galaxy.js           # 银河带 offscreen canvas
│   │   ├── nebula.js           # 星云 offscreen canvas
│   │   ├── planet.js           # ★ 行星/月球天体（v4.0 新增）
│   │   ├── comets.js           # ★ 流星/彗星系统（v4.0 新增）
│   │   └── particles.js        # 粒子创建/更新/渲染 + 贝塞尔拖尾
│   │
│   ├── input/
│   │   ├── mouse.js            # 鼠标事件 → 状态更新
│   │   └── touch.js            # 触摸事件 → 状态更新
│   │
│   ├── ui/
│   │   ├── cursor.js           # 自定义光标 DOM（光晕+圆环）
│   │   ├── indicator.js        # 高度指示条 + 状态标签
│   │   └── toast.js            # 提示浮层
│   │
│   └── utils/
│       ├── math.js             # rand, lerp, dist, wrap, easeOut, quadraticBezier
│       └── color.js            # hslToRgb
```

---

## 2. 技术栈

| 项目 | 说明 |
|------|------|
| **构建工具** | Vite 6.x（ES Modules 原生支持，HMR 热更新） |
| **语言** | 纯 JavaScript（ES Modules） |
| **渲染** | Canvas 2D API |
| **依赖** | 零运行时依赖，仅 vite 作为开发构建工具 |

---

## 3. 启动与构建

> 项目根目录: `d:\code_with_AI\web_test\stars-project`

```bash
# 每次打开：进入目录 + 启动开发服务器
cd d:\code_with_AI\web_test\stars-project
npx vite
# → 浏览器自动打开 http://localhost:3000
# → 按 Ctrl+C 关闭服务器

# 开发（等效命令）
npm run dev

# 生产构建（输出到 dist/，包含 index.html + JS）
npx vite build     # 或 npm run build

# 预览生产构建（模拟线上环境）
npm run preview    # 或 npx vite preview
```

### 部署到互联网（免费）

构建后 `dist/` 文件夹即纯静态文件，可部署到任意静态托管平台：

| 平台 | 操作 |
|------|------|
| **Vercel** (vercel.com) | 注册 → 拖拽 `dist/` 文件夹到网页 → 获得 `https://xxx.vercel.app` 链接 |
| **Netlify** (netlify.com) | 注册 → 拖拽 `dist/` 文件夹到网页 → 获得 `https://xxx.netlify.app` 链接 |
| **GitHub Pages** | 将 `dist/` 内容推送到 `gh-pages` 分支 → 设置 Pages 即可 |

> 推荐 Vercel 或 Netlify，无需命令行，拖拽即上线，链接可直接分享。```

---

## 4. 模块职责与数据流

### 数据流图

```
  ┌──────────────┐       ┌──────────────┐
  │  input/mouse  │       │  input/touch  │
  │  input/touch  │──────▶│  (更新 state) │
  └──────────────┘       └──────┬───────┘
                                │
                         ┌──────▼──────┐
                         │  core/state  │  ◀── 单一数据源
                         └──────┬──────┘
                                │
        ┌───────────┬───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼           ▼
   systems/     systems/    systems/     systems/     systems/
   altitude     camera      background   particles    comets
   planet       atmosphere  galaxy       nebula
        │           │           │           │           │
        └───────────┴───────────┼───────────┴───────────┘
                                ▼
                         core/canvas.js
                       (renderFrame 调度)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                ui/cursor   ui/indicator  ui/toast
```

### 模块职责边界

| 层 | 职责 | 禁止 |
|----|------|------|
| `core/state.js` | 存储所有共享状态 | 不包含逻辑 |
| `core/canvas.js` | RAF 循环、按序调用各系统 | 不包含业务 |
| `systems/*` | 纯逻辑：update/draw | 不读 DOM 事件 |
| `input/*` | 监听事件 → 写 state | 不渲染 |
| `ui/*` | 管理 DOM 元素 | 不碰 Canvas |

---

## 5. 渲染层级架构

渲染顺序从底到顶（后绘制的覆盖前者）：

```
第 1 层  →  纯黑背景填充 (#010108)
第 2 层  →  银河带 (galaxyCanvas, 太空模式可见, alpha 随 spaceFactor)
第 3 层  →  大气渐变 (低空明显, 高空消失, alpha 随 altitude)
第 4 层  →  星云 (中低空可见, 高空淡出)
第 5 层  →  3 层视差背景星 (始终可见, 响应相机偏移)
第 6 层  →  太空密集星层 (spaceFactor > 0 时渐显)
第 7 层  →  行星/月球 (spaceFactor > 0.15 时渐显)
第 8 层  →  彗星 (随机出现)
第 9 层  →  拖动轨迹线 (isDragging 时)
第 10 层 →  粒子光晕层 (additive blending, lighter)
第 11 层 →  粒子星座连线
第 12 层 →  粒子星形核心 (4 尖星形 + 中心白点)
第 13 层 →  鼠标位置柔光
第 14 层 →  太空拖拽速度线
```

> ⚠️ **重要**: 第 10 层 additive blending 前后必须 `save()`/`restore()` 隔离。

---

## 6. 核心系统详解

### 6.1 高度/海拔系统

**文件**: `src/systems/altitude.js`

**核心变量**:
- `state.mouseY` — 原始鼠标 Y 坐标
- `state.targetAltitude` — 目标海拔（0~1）
- `state.altitude` — 平滑后的实际海拔
- `state.isSpaceMode` — `altitude > 0.82`
- `state.spaceFactor` — 过渡因子: `(altitude - 0.7) / 0.3`，clamp 0~1

**v4.0 关键改进 — 非线性映射**:

```js
targetAltitude = Math.pow(1 - mouseY / height, 2.5)
```

使用 `Math.pow(x, 2.5)` 非线性映射，使中低空区间占据更大的鼠标行程。用户需要将鼠标移动更多才能到达太空，过渡更加优雅。

**平滑速度**: `lerp(altitude, targetAltitude, 0.015)`（v3 是 0.06，现在慢 4 倍）

**海拔分区**:

| 海拔 | 名称 | 视觉效果 |
|------|------|----------|
| 0.00~0.15 | 地表 | 浓厚大气散射，橙色地平线光 |
| 0.15~0.45 | 大气层 | 大气渐薄，暖色粒子为主 |
| 0.45~0.82 | 高空 | 大气淡出，星云淡出 |
| 0.82~1.00 | 太空 | 大气消失，银河+密星+行星显现，冷色粒子 |

---

### 6.2 相机平移系统

**文件**: `src/systems/camera.js`

- **拖动灵敏度**: `DRAG_SENSITIVITY = 0.5`
- **回中速度**: `RETURN_SPEED = 0.035`（松开后缓慢弹性回中）
- **跟随速度**: `FOLLOW_SPEED = 0.1`

**`worldToScreen(wx, wy, depthFactor)`**: 世界坐标转屏幕坐标，使用 `wrap()` 实现无缝循环。

---

### 6.3 背景星层

**文件**: `src/systems/background.js`

使用 `StarField` 类，存储在 `worldToScreen` 兼容的世界坐标中。

**3 层视差星空（始终可见）**:

| 层 | 数量 | 透明度 | 尺寸 | 色相 | 视差乘数 |
|----|------|--------|------|------|----------|
| 远 | 180 | 0.08~0.22 | 0.3~0.9 | 30~270 | 0.15 |
| 中 | 130 | 0.15~0.5 | 0.4~1.1 | 30~280 | 0.40 |
| 近 | 70  | 0.3~1.2 | 0.5~1.4 | 30~290 | 0.85 |

**太空密集星层**（仅 `spaceFactor > 0` 渲染）:

| 层 | 数量 | 透明度 | 尺寸 | 色相 | 视差乘数 |
|----|------|--------|------|------|----------|
| 太空远 | 500 | 0.4~1.8 | 0.3~1.6 | 180~320 | 0.5 |
| 太空近 | 150 | 0.6~2.2 | 0.6~2.2 | 190~300 | 0.7 |

---

### 6.4 大气渲染

**文件**: `src/systems/atmosphere.js`

- **alpha**: `1 - easeOut(min(1, altitude / 0.35))`
- 底部深蓝紫渐变 + 地平线 `rgba(255,100,30)` 暖光
- 海拔 0.35 以上基本不可见

---

### 6.5 银河带

**文件**: `src/systems/galaxy.js`

- 2× 尺寸 offscreen canvas 预渲染
- 2000 颗银河星 + 核心柔光 + 800 颗尘埃
- 色相 200~280（蓝紫）
- **alpha**: `easeOut(spaceFactor) * 0.75`
- 相机响应系数: x=0.005, y=0.003

---

### 6.6 星云

**文件**: `src/systems/nebula.js`

- 3 个椭圆柔光（色相 225/260/290）
- **alpha**: `(1 - spaceFactor) * 0.7`

---

### 6.7 行星/月球 (v4.0 新增)

**文件**: `src/systems/planet.js`

太空模式下可见的大型天体，offscreen canvas 预渲染。

**特征**:
- **球体明暗**: 径向渐变模拟 3D 光照（光源左上角）
- **环形山**: 35 个随机分布的陨石坑（暗面+亮边）
- **月海暗斑**: 5 个柔光暗区模拟月海
- **大气光晕**: 外层蓝色光晕（`rgba(80,140,210)`）
- **尺寸**: `min(w, h) * 0.22`（约视口 22%）
- **位置**: 右上区域 (72%, 28%)，随相机缓慢偏移
- **淡入**: `spaceFactor > 0.15` 时开始显现，0.65 时完全可见

---

### 6.8 流星/彗星 (v4.0 新增)

**文件**: `src/systems/comets.js`

**行为**:
- 随机间隔出现（4~18 秒），太空中频率翻倍
- 最多同时 3 颗
- 斜向飞行，穿越屏幕

**渲染**:
- **彗尾**: 80px 渐变拖尾，透明度按距离平方衰减
- **头部**: additive blending 光晕 + 白色亮核
- **色相**: 30~280 随机

---

### 6.9 粒子系统（含贝塞尔优化）

**文件**: `src/systems/particles.js`

**贝塞尔曲线拖尾优化** (v4.0 新增):

```js
// 使用 trailPoints 最近 3 个点做二次贝塞尔插值
quadraticBezier(p0, p1, p2, t)
```

当拖拽且 `trailPoints.length >= 3` 且速度 > 5px/frame 时，沿贝塞尔曲线采样生成粒子，替代原来的离散点生成。拖尾更平滑自然。

**粒子属性**:
- 颜色: `lerp(暖色25~50, 冷色190~290, altitude)` — 随高度渐变
- 尺寸: `intense ? 2.5~7.5 : 1.5~5`
- 生命: `intense ? 1.0~2.2s : 0.5~1.4s`
- 鼠标引力: 拖拽半径 240px/力 0.06，普通半径 130px/力 0.02
- 尺寸衰减: `size = maxSize * (0.25 + 0.75 * sin(π * life))`

**渲染三层**:
1. Additive blending 光晕（3.5× 尺寸径向渐变）
2. 4 尖星形（白光外层 + 彩色内层，双层叠加）
3. 中心白亮点

---

### 6.10 星座连线

- 距离阈值: 80px
- 透明度: `(1 - d/80) * 0.4 * min(lifeA, lifeB)`
- 颜色: 两颗粒子 RGB 中间值
- 仅在双方 `life > 0.15` 时绘制

---

### 6.11 自定义光标

**文件**: `src/ui/cursor.js`

| 元素 | CSS | 行为 |
|------|-----|------|
| `.cursor-glow` | 32px 径向渐变 | 拖拽放大至 52px |
| `.cursor-ring` | 26px 圆环 + pulse 动画 | 拖拽放大至 42px + fast pulse |

| 模式 | 颜色 |
|------|------|
| 默认（地表/大气层） | 暖金色 `rgba(255,220,140)` |
| 太空（`.space-mode`） | 冰蓝色 `rgba(180,210,255)` |

---

### 6.12 UI 叠加层

**文件**: `src/ui/indicator.js`, `src/ui/toast.js`

| 元素 | ID | 位置 | 功能 |
|------|-----|------|------|
| 提示浮层 | `hint` | 底部居中 | 5 秒后自动淡出 |
| 高度指示条 | `altitudeBar` | 右侧居中 | 160px 竖条，填充映射海拔 |
| 状态标签 | `statusTag` | 左侧居中 | 竖排：地表/大气层/高空/太空 |

---

## 7. 全局状态变量

**文件**: `src/core/state.js`

| 变量 | 类型 | 初始值 | 说明 |
|------|------|--------|------|
| `width`, `height` | number | `0` | Canvas 尺寸 |
| `time` | number | `0` | RAF 时间戳 |
| `mouseX`, `mouseY` | number | `-200` | 原始鼠标坐标 |
| `smoothMouseX`, `smoothMouseY` | number | `-200` | 平滑鼠标（lerp 0.1） |
| `isDragging` | boolean | `false` | 拖拽状态 |
| `cameraX`, `cameraY` | number | `0` | 实际相机偏移 |
| `targetCameraX`, `targetCameraY` | number | `0` | 目标相机偏移 |
| `dragPrevX`, `dragPrevY` | number | `0` | 上帧拖拽位置 |
| `altitude` | number | `0` | 平滑海拔（lerp 0.015） |
| `targetAltitude` | number | `0` | 目标海拔 |
| `isSpaceMode` | boolean | `false` | altitude > 0.82 |
| `spaceFactor` | number | `0` | 太空过渡因子（0~1） |
| `particles` | Array | `[]` | 粒子数组 |
| `MAX_PARTICLES` | const | `500` | 粒子上限 |
| `trailPoints` | Array | `[]` | 拖尾轨迹点（贝塞尔用） |
| `MAX_TRAIL_PTS` | const | `40` | 轨迹点上限 |
| `comets` | Array | `[]` | 彗星数组 |
| `nextCometTime` | number | `0` | 下次生成彗星的时间 |

---

## 8. 工具函数

**文件**: `src/utils/math.js`, `src/utils/color.js`

| 函数 | 说明 |
|------|------|
| `rand(min, max)` | 随机浮点数 |
| `randInt(min, max)` | 随机整数 |
| `lerp(a, b, t)` | 线性插值 |
| `dist(x1,y1,x2,y2)` | 欧氏距离 |
| `wrap(v, max)` | 正值 wrap 循环 |
| `easeOut(t)` | easeOutExpo |
| `quadraticBezier(p0,p1,p2,t)` | 二次贝塞尔插值（v4.0 新增） |
| `hslToRgb(h,s,l)` | HSL → RGB |

---

## 9. 性能参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 粒子上限 | 500 | 超出 shift 最早 |
| 背景星总数 | 380 | 3 层 |
| 太空额外星 | 650 | 2 层 |
| 银河星 | 2000 | offscreen |
| 银河尘埃 | 800 | offscreen |
| 行星环形山 | 35 | offscreen |
| 轨迹点上限 | 40 | 贝塞尔用 |
| 连线距离 | 80px | O(n²) |
| 彗星间隔 | 4~18s | 太空减半 |
| 彗星上限 | 3 | 同时 |
| 高度平滑 | 0.015 | lerp 因子 |
| 高度非线性 | pow(x, 2.5) | 扩展中低空 |

---

## 10. 后续开发指南

### 添加新系统的步骤

1. 在 `src/systems/` 创建新模块
2. 在 `src/core/state.js` 添加需要的状态变量（如需要）
3. 在 `src/main.js` 中 import 并在 `renderFrame()` 中按正确层级调用
4. 参考渲染层级（第 5 节）确定绘制顺序
5. 如使用 offscreen canvas，在 `resize` 事件中重新初始化

### 关键约束

- **星空无限性**: 所有背景元素必须通过 `worldToScreen()` + `wrap()` 渲染
- **Additive blending 隔离**: 光晕层前后必须 `save()`/`restore()`
- **海拔联动**: 新元素使用 `state.altitude` / `state.spaceFactor` / `state.isSpaceMode`
- **相机联动**: 新背景元素响应 `state.cameraX` / `state.cameraY`
- **颜色一致性**: 使用 `hslToRgb()` + `lerp()` 配合海拔插值
- **性能**: 大量预计算用 offscreen canvas；粒子严格限制 500

### 可扩展方向

- [ ] 多个行星/不同天体类型
- [ ] 星座图案（预设连线形状）
- [ ] 音效/背景音乐
- [ ] 设置面板（粒子密度、颜色主题等）
- [ ] WebGL/着色器迁移（性能大幅提升）
- [ ] 日夜循环
- [ ] 轨道粒子/行星环
- [ ] 黑洞/虫洞特效

---

## 11. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06 | 初始单文件 HTML，基础粒子拖尾 |
| v2.0 | 2026-06 | 添加自定义光标、三层视差星空、星云、additive blending |
| v3.0 | 2026-06 | 添加相机平移、海拔系统、银河带、太空模式、UI 指示器 |
| **v4.0** | **2026-06** | **迁移到 Vite 模块化架构、行星天体、流星彗星、贝塞尔拖尾、非线性海拔** |
