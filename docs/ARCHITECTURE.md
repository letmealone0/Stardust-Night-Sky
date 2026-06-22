# 深空探索 - 架构文档

## 项目概述

深空探索是一个基于 Three.js 的 3D 太空探索体验，使用 WASD 控制移动，鼠标控制视角，提供沉浸式的深空探索体验。

## 技术栈

- **渲染引擎**: Three.js (v0.184.0)
- **构建工具**: Vite
- **语言**: JavaScript (ES Modules)

## 目录结构

```
src/
├── core/                    # 核心系统
│   ├── engine.js           # 引擎主控
│   ├── scene.js            # 场景管理
│   ├── camera.js           # 相机系统
│   ├── renderer.js         # 渲染器
│   └── config.js           # 全局配置
│
├── controls/                # 控制系统
│   ├── player.js           # 玩家控制
│   └── input.js            # 输入管理
│
├── objects/                 # 3D 对象
│   ├── stars.js            # 星空背景
│   ├── planets.js          # 行星系统
│   └── nebula.js           # 星云效果
│
├── postprocessing/          # 后处理
│   └── composer.js         # 效果合成器
│
├── ui/                      # UI 系统
│   └── hud.js              # HUD 界面
│
├── utils/                   # 工具函数
│   ├── math.js             # 数学工具
│   └── random.js           # 随机生成
│
└── main.js                  # 主入口
```

## 模块说明

### 核心系统 (core/)

#### engine.js
引擎主控，负责：
- 初始化所有子系统
- 管理渲染循环
- 协调各模块更新
- 处理窗口事件

#### scene.js
场景管理，负责：
- 创建 Three.js 场景
- 管理 3D 对象
- 添加光照
- 场景更新

#### camera.js
相机系统，负责：
- 创建透视相机
- 管理相机参数
- 处理窗口变化

#### renderer.js
渲染器管理，负责：
- 创建 WebGL 渲染器
- 配置渲染参数
- 处理画布大小

#### config.js
全局配置，包含：
- 相机参数
- 玩家控制参数
- 星空参数
- 行星参数
- 后处理参数

### 控制系统 (controls/)

#### player.js
玩家控制，实现：
- WASD 移动
- 鼠标视角控制
- 空格/Shift 上下移动
- Ctrl 冲刺
- 移动阻尼

#### input.js
输入管理，负责：
- 键盘事件监听
- 鼠标事件监听
- 输入状态管理

### 3D 对象 (objects/)

#### stars.js
星空背景，使用：
- InstancedMesh 优化渲染
- 多层星空（近、中、远）
- 闪烁动画
- 亮星效果

#### planets.js
行星系统，包含：
- 程序化行星生成
- 大气层 Shader
- 行星环
- 自转和公转动画

#### nebula.js
星云效果，实现：
- 体积感云团
- 自定义 Shader
- 脉冲动画
- 渐变色效果

### 后处理 (postprocessing/)

#### composer.js
效果合成器，添加：
- UnrealBloomPass（辉光）
- 暗角效果
- 色差效果
- 输出通道

### UI 系统 (ui/)

#### hud.js
HUD 界面，显示：
- 准星
- FPS
- 速度
- 位置
- 消息提示
- 操作提示

### 工具函数 (utils/)

#### math.js
数学工具，包含：
- 线性插值
- 范围限制
- 噪声函数
- 距离计算

#### random.js
随机生成，提供：
- 范围随机数
- 随机颜色
- 随机向量

## 数据流

```
用户输入
    ↓
InputManager
    ↓
PlayerController
    ↓
Camera 更新
    ↓
SceneManager.update()
    ↓
各对象系统更新
    ↓
PostProcessing.render()
    ↓
屏幕输出
```

## 性能优化

1. **InstancedMesh**: 批量渲染星星
2. **视锥体剔除**: Three.js 自动处理
3. **按需渲染**: 静止时降低帧率
4. **Shader 优化**: 减少 overdraw
5. **LOD 系统**: 根据距离切换细节

## 扩展点

### 添加新行星类型
在 `planets.js` 的 `createPlanetMaterial()` 中添加新类型。

### 添加新后处理效果
在 `composer.js` 的 `init()` 方法中添加新 Pass。

### 添加新 UI 元素
在 `hud.js` 中创建新元素并添加到 DOM。

## 配置说明

所有可调参数都在 `config.js` 中，包括：
- 相机参数（FOV、近远平面）
- 移动速度、冲刺倍数
- 星星数量、分布范围
- 行星数量、大小范围
- 后处理强度

修改配置后无需重新构建，刷新页面即可生效。
