/**
 * 深空探索 - 主入口
 * 初始化 Three.js 引擎并启动渲染循环
 */

import * as THREE from 'three';
import { Engine } from './core/engine.js';

// 引擎实例
let engine = null;

// 系统自检日志定义
const TELEMETRY_STEPS = [
  { p: 10, text: "> BOOT: Onboard Navigation OS Initializing..." },
  { p: 25, text: "> SYS: Calibrating Gravitational Lens Predictor..." },
  { p: 45, text: "> SENS: Mapping Logarithmic Galactic Coordinate Grid..." },
  { p: 65, text: "> WARP: Charging Core Quantum Reactor Drives..." },
  { p: 85, text: "> HUD: Connecting Celestial Topology Matrix..." },
  { p: 100, text: "> SHIP: Boot Sequence Complete. Ready to launch." }
];

let loggedSteps = new Set();

/**
 * 更新加载进度 — 更新百分比数字并向遥测面板滚动添加自检日志
 */
function updateLoadingProgress(percent) {
  // 更新百分比数字
  const statusPercent = document.getElementById('statusPercent');
  if (statusPercent) {
    statusPercent.textContent = `ONLINE_${String(percent).padStart(2, '0')}%`;
  }

  // 动态向面板中滚动添加自检遥测日志
  const telemetryLog = document.getElementById('telemetryLog');
  if (telemetryLog) {
    TELEMETRY_STEPS.forEach(step => {
      if (percent >= step.p && !loggedSteps.has(step.p)) {
        loggedSteps.add(step.p);

        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = step.text;

        // 绿色标记完成行
        if (step.p === 100) line.style.color = '#55ff99';

        telemetryLog.appendChild(line);

        // 自动向上滚动日志，保持最新一行在底部
        telemetryLog.scrollTop = telemetryLog.scrollHeight;
      }
    });
  }
}

/**
 * 隐藏加载画面 — 触发观察窗螺旋向外开合动效
 */
function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('fade-out');
    setTimeout(() => {
      loading.style.display = 'none';
    }, 1300); // 预留 1.3 秒开合动画时间
  }
}

/**
 * 初始化应用
 */
async function init() {
  try {
    console.log('[Main] 初始化深空探索...');
    updateLoadingProgress(10);

    // 创建引擎
    engine = new Engine();
    updateLoadingProgress(20);

    // 在 engine.init() 执行期间，用平滑进度动画填充 20→78 的间隙（ease-out 曲线）
    let progressAnimId = null;
    const progressStartTime = performance.now();

    const animateProgress = () => {
      const elapsed = performance.now() - progressStartTime;
      // ease-out cubic: 前快后慢，8 秒内趋近 78（留 2% 给真实完成）
      const t = Math.min(elapsed / 8000, 1);
      const current = 20 + (78 - 20) * (1 - Math.pow(1 - t, 3));
      updateLoadingProgress(Math.round(current));
      progressAnimId = requestAnimationFrame(animateProgress);
    };
    progressAnimId = requestAnimationFrame(animateProgress);

    // 初始化引擎（含场景加载、贴图等重量级操作）
    await engine.init();

    // 停止平滑动画，真实进度到 80
    if (progressAnimId) cancelAnimationFrame(progressAnimId);
    progressAnimId = null;
    updateLoadingProgress(80);

    // 启动渲染循环
    engine.start();
    updateLoadingProgress(100);

    // 导出引擎实例到控制台（便于调试）
    window.engine = engine;

    // 隐藏加载画面
    const activeEngine = engine;
    setTimeout(() => {
      if (!activeEngine || activeEngine !== engine || !activeEngine.hud) return;
      hideLoading();
      // 显示欢迎消息
      const warning = activeEngine.initializationWarnings?.length
        ? ` · 警告：${activeEngine.initializationWarnings.join('、')}加载失败`
        : '';
      activeEngine.hud.showMessage(`欢迎来到深空探索 · 点击屏幕开始 · WASD移动 Shift冲刺 V切视角 M看地图 R回起点 P暂停${warning}`, 6000);
    }, 500);

    console.log('[Main] 初始化完成');
  } catch (error) {
    console.error('[Main] 初始化失败:', error);
    const message = error instanceof Error ? error.message : String(error);
    showError(message);
  }
}

/**
 * 显示错误信息
 */
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #ff6b6b;
    font-family: 'Inter', sans-serif;
    font-size: 16px;
    text-align: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 10px;
    border: 1px solid rgba(255, 100, 100, 0.3);
  `;
  errorDiv.textContent = `初始化失败: ${message}`;
  document.body.appendChild(errorDiv);
}

/**
 * 清理资源
 */
function cleanup() {
  if (engine) {
    engine.dispose();
    engine = null;
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 页面卸载时清理
window.addEventListener('beforeunload', cleanup);
