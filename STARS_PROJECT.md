# 星尘夜空 (Stardust Night Sky) — 项目文档

> **项目**: `stars-project/` · **版本**: v4.1 · **最后更新**: 2026-06-14
>
> Vite + ES Modules 模块化架构的交互式星空网页。
> 粒子拖尾、点击切换锁定、相机平移、海拔高度、行星天体、流星彗星、贝塞尔拖尾。
> v4.1: 性能优化 + delta-time + 空间哈希 + 辉光缓存 + 视觉增强 + 可访问性。

---

## 目录

1. [项目结构](#1-项目结构)
2. [技术栈](#2-技术栈)
3. [启动与构建](#3-启动与构建)
4. [模块职责与数据流](#4-模块职责与数据流)
5. [渲染层级架构](#5-渲染层级架构)
6. [核心系统详解](#6-核心系统详解)
   - [6.1 高度/海拔系统](#61-高度海拔系统)
   - [6.2 相机系统（点击切换）](#62-相机系统点击切换)
   - [6.3 背景星层](#63-背景星层)
   - [6.4 大气渲染](#64-大气渲染)
   - [6.5 银河带](#65-银河带)
   - [6.6 星云](#66-星云)
   - [6.7 行星/月球](#67-行星月球)
   - [6.8 流星/彗星](#68-流星彗星)
   - [6.9 粒子系统](#69-粒子系统)
   - [6.10 星座连线（空间哈希）](#610-星座连线空间哈希)
   - [6.11 自定义光标](#611-自定义光标)
   - [6.12 UI 叠加层](#612-ui-叠加层)
7. [全局状态变量](#7-全局状态变量)
8. [工具函数](#8-工具函数)
9. [性能参数与配置](#9-性能参数与配置)
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
│   │   ├── config.js           # ★ v4.1 集中化配置（所有可调参数）
│   │   └── canvas.js           # Canvas 尺寸管理、RAF 循环、dt 计算
│   │
│   ├── systems/
│   │   ├── altitude.js         # 海拔计算、太空判定、非线性映射
│   │   ├── camera.js           # 相机平移、worldToScreen
│   │   ├── background.js       # 3层视差星空 + 2层太空密星
│   │   ├── atmosphere.js       # 大气渐变（带缓存）+ 地平线暖光
│   │   ├── galaxy.js           # 银河带 offscreen canvas（含内存释放）
│   │   ├── nebula.js           # 星云 offscreen canvas（含内存释放）
│   │   ├── planet.js           # 行星/月球天体 + 缓慢旋转呼吸
│   │   ├── comets.js           # 流星/彗星系统（dt 帧率无关）
│   │   └── particles.js        # 粒子系统 + 辉光 Sprite Sheet + 空间哈希连线
│   │
│   ├── input/
│   │   ├── mouse.js            # 鼠标事件 → 状态更新（点击切换）
│   │   └── touch.js            # 触摸事件 → 状态更新（点击切换 + 防抖）
│   │
│   ├── ui/
│   │   ├── cursor.js           # 自定义光标 DOM（光晕+圆环）
│   │   ├── indicator.js        # 高度指示条 + 状态标签
│   │   └── toast.js            # 提示浮层
│   │
│   └── utils/
│       ├── math.js             # rand, lerp, dist, wrap, easeOut, quadraticBezier, dtLerp
│       ├── color.js            # hslToRgb
│       └── coords.js           # ★ v4.1 canvasCoords 共享函数
```

---

## 2. 技术栈

| 项目 | 说明 |
|------|------|
| **构建工具** | Vite 6.x（ES Modules 原生支持，HMR 热更新） |
| **语言** | 纯 JavaScript（ES Modules） |
| **渲染** | Canvas 2D API（`alpha: false` 禁用透明通道） |
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

> 推荐 Vercel 或 Netlify，无需命令行，拖拽即上线，链接可直接分享。

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
                         │  core/config │  ◀── ★ v4.1 集中配置
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
| `core/config.js` | ★ v4.1 集中化可调参数 | 不存储运行时状态 |
| `core/canvas.js` | RAF 循环、dt 计算、按序调用各系统 | 不包含业务 |
| `systems/*` | 纯逻辑：update/draw | 不读 DOM 事件 |
| `input/*` | 监听事件 → 写 state | 不渲染 |
| `ui/*` | 管理 DOM 元素 | 不碰 Canvas |

---

## 5. 渲染层级架构

渲染顺序从底到顶（后绘制的覆盖前者）：

```
第 1 层  →  纯黑背景填充 (#010108)
第 2 层  →  银河带 (galaxyCanvas, 太空模式可见, alpha 随 spaceFactor)
第 3 层  →  大气渐变 (低空明显, 高空消失, ★ v4.1 带缓存)
第 4 层  →  星云 (中低空可见, 高空淡出)
第 5 层  →  3 层视差背景星 (始终可见, 响应相机偏移)
第 6 层  →  太空密集星层 (spaceFactor > 0 时渐显)
第 7 层  →  行星/月球 (spaceFactor > 0.15 时渐显, ★ v4.1 旋转+呼吸)
第 8 层  →  彗星 (随机出现, ★ v4.1 dt 帧率无关)
第 9 层  →  拖动轨迹线 (自由模式)
第 10 层 →  粒子光晕层 (★ v4.1 预渲染 Sprite Sheet, additive blending)
第 11 层 →  粒子星座连线 (★ v4.1 空间哈希优化)
第 12 层 →  粒子星形核心 (4 尖星形 + 中心白点, ★ v4.1 无 save/restore)
第 13 层 →  鼠标位置柔光
第 14 层 →  太空拖拽速度线 (自由模式 + 太空)
第 15 层 →  暗角 + 色温偏移 (★ v4.1 增强)
```

> ⚠️ **重要**: 第 10 层 additive blending 前后必须 `save()`/`restore()` 隔离。

---

## 6. 核心系统详解

### 6.1 高度/海拔系统

**文件**: `src/systems/altitude.js`

**核心变量**:
- `state.mouseY` — 原始鼠标 Y 坐标
- `state.targetAltitude` — 目标海拔（0~1）
- `state.altitude` — 平滑后的实际海拔（★ v4.1 帧率无关 dtLerp）
- `state.isSpaceMode` — `altitude > config.SPACE_THRESHOLD`（0.82）
- `state.spaceFactor` — 过渡因子: `(altitude - 0.7) / 0.3`，clamp 0~1

**v4.0 关键改进 — 非线性映射**:

```js
targetAltitude = Math.pow(1 - mouseY / height, ALTITUDE_POWER)  // 2.5
```

使用 `Math.pow(x, 2.5)` 非线性映射，使中低空区间占据更大的鼠标行程。

**★ v4.1 交互模型**:
- **默认状态**（`cameraLocked = true`）：画面完全冻结。鼠标移动不影响相机位置和海拔高度。
- **点击切换**：点击解锁 → 画面可平移且高度随鼠标 Y 变化；再次点击 → 全部冻结。
- **冻结模式守卫**: `if (!state.cameraLocked && state.mouseY > 0)` — 冻结时 targetAltitude 保持不变。

**海拔分区**:

| 海拔 | 名称 | 视觉效果 |
|------|------|----------|
| 0.00~0.15 | 地表 | 浓厚大气散射，橙色地平线光 |
| 0.15~0.45 | 大气层 | 大气渐薄，暖色粒子为主 |
| 0.45~0.82 | 高空 | 大气淡出，星云淡出 |
| 0.82~1.00 | 太空 | 大气消失，银河+密星+行星显现，冷色粒子 |

---

### 6.2 相机系统（点击切换）

**文件**: `src/systems/camera.js`

**★ v4.1 交互模型 — 点击切换**:

- `state.cameraLocked = true` → **冻结**：相机固定在原位，不响应鼠标移动。画面保持静止。
- `state.cameraLocked = false` → **自由**：相机平滑跟随鼠标拖拽偏移。拖拽灵敏度 `DRAG_SENSITIVITY = 0.5`。
- **切换方式**: 鼠标点击画布任意位置 / 触摸点击（tap < 300ms, 移动 < 10px）。
- **默认状态**: `cameraLocked: true`（开启即冻结）。

**关键函数**:
- `updateCamera()`: 冻结模式直接 return；自由模式 dtLerp 相机到目标。
- `applyDragDelta(dx, dy)`: 累加到 `targetCameraX/Y`。
- `worldToScreen(wx, wy, depthFactor)`: 世界坐标转屏幕坐标，使用 `wrap()` 实现无缝循环。

**★ v4.1 优化**:
- 删除了未使用的 `RETURN_SPEED` 常量（相机不再自动回中）。
- 相机过渡改为帧率无关的 `dtLerp`。

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

**★ v4.1 视觉增强**:
- 每颗星随机饱和度（0.1-0.6）和基础亮度（0.5-0.9），不再统一。
- 5% 蓝白炽星（色相 200-220）、3% 青蓝星（170-190）、4% 暖黄星（40-50）。
- 每层前 6 颗为"锚点星"：alpha 0.8-1.0，尺寸 1.8×，更亮更大。
- `reducedMotion` 时关闭闪烁动画（twinkle 固定为 0.5）。

---

### 6.4 大气渲染

**文件**: `src/systems/atmosphere.js`

- **alpha**: `1 - easeOut(min(1, altitude / ATMOSPHERE_FADE_ALTITUDE))`
- 8 阶主渐变（深蓝紫 → 透明）
- 5 阶地平线暖光（`rgba(255,100,30)` 系列）
- 海拔 0.35 以上基本不可见

**★ v4.1 缓存优化**: 渐变对象基于 `atmoAlpha`（精度 0.01）和画布尺寸缓存。只在值变化时重建渐变；绝大多数帧直接复用已有渐变对象，不创建新的 `createLinearGradient`。

---

### 6.5 银河带

**文件**: `src/systems/galaxy.js`

- 2× 尺寸 offscreen canvas 预渲染（最大 4096px）
- 2000 颗银河星 + 核心柔光 + 800 颗尘埃
- **alpha**: `easeOut(spaceFactor) * 0.75`
- 相机响应系数: x=0.005, y=0.003

**★ v4.1 内存修复**: resize 时先释放旧 offscreen canvas（`width = 0; canvas = null`），再创建新的，避免每次 resize 泄漏 ~3MB 内存。

---

### 6.6 星云

**文件**: `src/systems/nebula.js`

- 3 个椭圆柔光（色相 225/260/290）
- **alpha**: `(1 - spaceFactor) * 0.7`

**★ v4.1 内存修复**: 同银河带，resize 时先释放旧 offscreen canvas。

---

### 6.7 行星/月球

**文件**: `src/systems/planet.js`

太空模式下可见的大型天体，offscreen canvas 预渲染。

**特征**:
- **球体明暗**: 径向渐变模拟 3D 光照（光源左上角）
- **环形山**: 35 个随机分布的陨石坑（暗面+亮边）
- **月海暗斑**: 5 个柔光暗区模拟月海
- **大气光晕**: 外层蓝色光晕（`rgba(80,140,210)`）
- **尺寸**: `min(w, h) * 0.22`（约视口 22%）
- **位置**: 右上区域 (72%, 28%)，随相机缓慢偏移
- **淡入**: `spaceFactor > 0.15` 时开始显现

**★ v4.1 动画**: 缓慢旋转（`state.time * 0.0001` 弧度）+ 呼吸缩放（`sin(time * 0.0005) * 0.01 + 1.01`），让天体更有生命力。

**★ v4.1 内存修复**: resize 时先释放旧 offscreen canvas。

---

### 6.8 流星/彗星

**文件**: `src/systems/comets.js`

**行为**:
- 随机间隔出现（4~18 秒），太空中频率翻倍
- 最多同时 3 颗
- 斜向飞行，穿越屏幕

**渲染**:
- **彗尾**: 80px 渐变拖尾，透明度按距离平方衰减
- **头部**: additive blending 光晕 + 白色亮核
- **色相**: 30~280 随机

**★ v4.1 改进**:
- 位置和生命衰减使用 `state.dt` 实现帧率无关。
- `reducedMotion` 时减少出现频率。

---

### 6.9 粒子系统

**文件**: `src/systems/particles.js`

**★ v4.1 重大优化 — 辉光 Sprite Sheet**:

预渲染 10 种尺寸（8-176px 直径）的 9 阶平滑辉光到 offscreen Sprite Sheet。绘制循环中用 `ctx.drawImage` 替代每粒子创建一个 `createRadialGradient`（消除 500 次/帧渐变创建）。

**贝塞尔曲线拖尾优化** (v4.0 新增):

```js
// 使用 trailPoints 最近 3 个点做二次贝塞尔插值
quadraticBezier(p0, p1, p2, t)
```

**粒子属性**:
- 颜色: `lerp(暖色25~50, 冷色190~290, altitude)` — 随高度渐变
- 尺寸: `intense ? 2.5~7.5 : 1.5~5`（从 config 读取）
- 生命: `intense ? 1.0~2.2s : 0.5~1.4s`（从 config 读取）
- 鼠标引力: 自由半径 240px/力 0.06，冻结半径 130px/力 0.02
- 生命衰减: ★ v4.1 `life -= dt / maxLife`（帧率无关）
- 位置更新: ★ v4.1 `x += vx * dt * 60`（帧率无关）

**渲染三层**:
1. Additive blending 光晕（★ 预渲染 Sprite Sheet drawImage）
2. 4 尖星形（白光外层 + 彩色内层，★ 无 save/restore）
3. 中心白亮点

**★ v4.1 优化汇总**:
- `shift()` → `splice()` 批量裁剪（O(N) 单次）
- `createRadialGradient` → 预渲染 Sprite Sheet drawImage（0 次/帧）
- `save()/restore()` 消除（星形 + 衍射光芒直接使用已烘焙 alpha 的颜色字符串）
- 鼠标引力在 `reducedMotion` 时跳过

---

### 6.10 星座连线（空间哈希）

**文件**: `src/systems/particles.js`（drawParticles 中）

**★ v4.1 重大优化 — 空间哈希网格**:

构建以 `CONNECT_DIST`（80px）为单元格的哈希网格。每个粒子只检查同格 + 8 个邻格的粒子，而非遍历全部。

- **优化前**: O(N²) = 500 粒子 → ~125,000 次/帧距离检查
- **优化后**: O(N·k) = 500 粒子 → ~6,750 次/帧
- **约 18 倍**减少

**视觉效果**:
- 距离阈值: 80px
- ★ v4.1 双层绘制：光晕线（宽 2px, alpha/3）+ 主线（宽 0.5px），营造发光连线
- 透明度: `(1 - d/80) * 0.4 * min(lifeA, lifeB)`
- 颜色: 两颗粒子 RGB 中间值
- reducedMotion 时完全跳过

---

### 6.11 自定义光标

**文件**: `src/ui/cursor.js`

| 元素 | CSS | 行为 |
|------|-----|------|
| `.cursor-glow` | 52px 径向渐变（自由） | 冻结缩小至 32px |
| `.cursor-ring` | 42px 圆环 + fastPulse（自由） | 冻结缩小至 26px + slowPulse |

| 模式 | 颜色 |
|------|------|
| 默认（地表/大气层） | 暖金色 `rgba(255,220,140)` |
| 太空（`.space-mode`） | 冰蓝色 `rgba(180,210,255)` |

**★ v4.1 交互对应**:
- 自由模式（`.locked` 类不存在）→ 大光标 + 快脉冲 → 表示可移动画面
- 冻结模式（`.locked` 类存在）→ 小光标 + 慢脉冲 → 表示画面已冻结

---

### 6.12 UI 叠加层

**文件**: `src/ui/indicator.js`, `src/ui/toast.js`

| 元素 | ID | 位置 | 功能 |
|------|-----|------|------|
| 提示浮层 | `hint` | 底部居中 | 5 秒后自动淡出 |
| 高度指示条 | `altitudeBar` | 右侧居中 | 160px 竖条，填充映射海拔 |
| 状态标签 | `statusTag` | 左侧居中 | 竖排：地表/大气层/高空/太空 |

**★ v4.1 自由/冻结指示**: 自由模式时高度条填充为粉色渐变(`#ff8844→#ffbb66→#ff99cc`)，冻结模式为蓝紫渐变，直观反映当前状态。

---

## 7. 全局状态变量

**文件**: `src/core/state.js`

| 变量 | 类型 | 初始值 | 说明 |
|------|------|--------|------|
| `width`, `height` | number | `0` | Canvas 逻辑像素尺寸 |
| `dpr` | number | `1` | devicePixelRatio |
| `time` | number | `0` | RAF 时间戳 (ms) |
| `dt` | number | `0` | ★ v4.1 delta time (秒), 上限 0.1 |
| `lastTime` | number | `0` | ★ v4.1 上一帧时间戳 |
| `mouseX`, `mouseY` | number | `-200` | 原始鼠标坐标 |
| `smoothMouseX`, `smoothMouseY` | number | `-200` | 平滑鼠标（★ v4.1 dtLerp） |
| `cameraLocked` | boolean | `true` | ★ v4.1 相机锁定（默认冻结画面） |
| `cameraX`, `cameraY` | number | `0` | 实际相机偏移（★ v4.1 dtLerp 平滑） |
| `targetCameraX`, `targetCameraY` | number | `0` | 目标相机偏移 |
| `dragPrevX`, `dragPrevY` | number | `0` | 上帧拖拽位置 |
| `altitude` | number | `0` | 平滑海拔（★ v4.1 dtLerp） |
| `targetAltitude` | number | `0` | 目标海拔 |
| `isSpaceMode` | boolean | `false` | altitude > SPACE_THRESHOLD |
| `spaceFactor` | number | `0` | 太空过渡因子（0~1） |
| `particles` | Array | `[]` | 粒子数组 |
| `MAX_PARTICLES` | number | `config.MAX_PARTICLES` | ★ v4.1 从 config 读取 |
| `trailPoints` | Array | `[]` | 拖尾轨迹点（贝塞尔用） |
| `MAX_TRAIL_PTS` | number | `config.MAX_TRAIL_PTS` | ★ v4.1 从 config 读取 |
| `comets` | Array | `[]` | 彗星数组 |
| `nextCometTime` | number | `0` | 下次生成彗星的时间 |
| `reducedMotion` | boolean | `false` | ★ v4.1 系统减少动画偏好 |

---

## 8. 工具函数

**文件**: `src/utils/math.js`, `src/utils/color.js`, `src/utils/coords.js`

| 函数 | 文件 | 说明 |
|------|------|------|
| `rand(min, max)` | math.js | 随机浮点数 |
| `randInt(min, max)` | math.js | 随机整数 |
| `lerp(a, b, t)` | math.js | 线性插值 |
| `dtLerp(a, b, frameRate, dt)` | math.js | ★ v4.1 帧率无关平滑过渡（指数衰减） |
| `dist(x1,y1,x2,y2)` | math.js | 欧氏距离 |
| `wrap(v, max)` | math.js | 正值 wrap 循环 |
| `easeOut(t)` | math.js | easeOutExpo |
| `quadraticBezier(p0,p1,p2,t)` | math.js | 二次贝塞尔插值 |
| `hslToRgb(h,s,l)` | color.js | HSL → RGB |
| `canvasCoords(cx, cy, canvas)` | coords.js | ★ v4.1 客户端坐标 → Canvas 逻辑坐标 |

---

## 9. 性能参数与配置

**★ v4.1 集中配置文件**: `src/core/config.js`（所有可调参数）

| 参数 | 值 | 说明 |
|------|-----|------|
| `MAX_PARTICLES` | 500 | 粒子上限 |
| `MAX_TRAIL_PTS` | 40 | 轨迹点上限 |
| `MAX_COMETS` | 3 | 同时彗星上限 |
| `CONNECT_DIST` | 80px | 连线距离（空间哈希格大小） |
| `DRAG_SENSITIVITY` | 0.5 | 相机拖拽灵敏度 |
| `FOLLOW_SPEED` | 0.1 | 相机跟随速度（dtLerp） |
| `ALTITUDE_POWER` | 2.5 | 海拔非线性映射指数 |
| `ALTITUDE_LERP` | 0.015 | 海拔平滑速率（dtLerp） |
| `SPACE_THRESHOLD` | 0.82 | 太空模式阈值 |
| `MOUSE_GLOW_R_FREE` | 70 / 38 | 光标辉光半径 |
| `MOUSE_GRAVITY_R_FREE` | 240 / 130 | 粒子鼠标引力半径 |
| `MOUSE_GRAVITY_FORCE_FREE` | 0.06 / 0.02 | 粒子鼠标引力度 |
| `VIGNETTE_MAX_ALPHA` | 0.45 | ★ 暗角强度 |

**★ v4.1 性能优化汇总**:

| 优化 | 效果 |
|------|------|
| 移除渲染循环中的 `resize()` | 消除 60 次/秒 DOM 布局重排 |
| Canvas `alpha: false` | 减少 GPU 合成开销 |
| 空间哈希连线 | O(N²) → O(N·k), ~18× 减少距离检查 |
| 辉光 Sprite Sheet | 0 次梯度创建/帧（原 500 次） |
| 消除 save/restore | 800+ 次/帧减少 |
| 大气渐变缓存 | 0 次梯度创建/帧（稳定时） |
| 离屏 Canvas 释放 | 每次 resize 不再泄漏 ~3MB |
| dt 帧率无关 | 120Hz/144Hz 表现一致 |
| Page Visibility | 后台暂停渲染，省电 |
| reduced-motion | 减少 90% 粒子+连线+引力+闪烁 |

---

## 10. 后续开发指南

### 添加新系统的步骤

1. 在 `src/systems/` 创建新模块
2. 如需可调参数，添加到 `src/core/config.js`
3. 如需运行时状态，在 `src/core/state.js` 添加字段
4. 在 `src/main.js` 中 import 并在 `renderFrame()` 中按正确层级调用
5. 参考渲染层级（第 5 节）确定绘制顺序
6. 如使用 offscreen canvas，在 `resize` 事件中重新初始化，**务必先释放旧 canvas**

### 关键约束

- **星空无限性**: 所有背景元素必须通过 `worldToScreen()` + `wrap()` 渲染
- **Additive blending 隔离**: 光晕层前后必须 `save()`/`restore()`
- **海拔联动**: 新元素使用 `state.altitude` / `state.spaceFactor` / `state.isSpaceMode`
- **相机联动**: 新背景元素响应 `state.cameraX` / `state.cameraY`
- **★ 帧率无关**: 所有时间相关计算使用 `state.dt`，通过 `dtLerp` 或 `dt * 60` 缩放
- **★ 配置优先**: 新参数优先加入 `config.js`，避免散落魔术数字
- **★ 内存安全**: resize 时释放旧 offscreen canvas
- **颜色一致性**: 使用 `hslToRgb()` + `lerp()` 配合海拔插值

### ★ v4.1 可扩展方向

- [ ] 多个行星/不同天体类型
- [ ] 星座图案（预设连线形状）
- [ ] 音效/背景音乐
- [ ] 设置面板（利用 config.js 一键绑定）
- [ ] WebGL/着色器迁移（性能大幅提升）
- [ ] 日夜循环
- [ ] 轨道粒子/行星环
- [ ] 黑洞/虫洞特效
- [ ] 进一步粒子系统重构（TypedArray SoA + 环形缓冲）

---

## 11. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06 | 初始单文件 HTML，基础粒子拖尾 |
| v2.0 | 2026-06 | 添加自定义光标、三层视差星空、星云、additive blending |
| v3.0 | 2026-06 | 添加相机平移、海拔系统、银河带、太空模式、UI 指示器 |
| v4.0 | 2026-06-10 | 迁移到 Vite 模块化架构、行星天体、流星彗星、贝塞尔拖尾、非线性海拔、点击切换相机锁定 |
| **v4.1** | **2026-06-14** | **性能优化（空间哈希、辉光缓存、dt 帧率无关、save/restore 消除、大气缓存、alpha:false、resize 移出循环、内存泄漏修复）；视觉增强（星空色彩、暗角色温、柔化连线、行星旋转呼吸）；可访问性（Page Visibility、prefers-reduced-motion）；代码质量（集中化 config.js、共享 coords.js、删除死代码、splice 替换 shift、触摸防抖、错误边界）** |
