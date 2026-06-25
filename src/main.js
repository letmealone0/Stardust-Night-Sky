/**
 * 深空探索 - 主入口
 * 初始化 Three.js 引擎并启动渲染循环
 */

import { Engine } from './core/engine.js';

// 引擎实例
let engine = null;

/**
 * 更新加载进度
 */
function updateLoadingProgress(percent) {
  const loadingBar = document.getElementById('loadingBar');
  if (loadingBar) {
    loadingBar.style.width = `${percent}%`;
  }
}

/**
 * 隐藏加载画面
 */
function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('fade-out');
    setTimeout(() => {
      loading.style.display = 'none';
    }, 500);
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

    // 初始化引擎
    await engine.init();
    updateLoadingProgress(80);

    // 启动渲染循环
    engine.start();
    updateLoadingProgress(100);

    // 导出引擎实例到控制台（便于调试）
    window.engine = engine;

    // 隐藏加载画面
    setTimeout(() => {
      hideLoading();
      // 显示欢迎消息
      engine.hud.showMessage('欢迎来到深空探索 - 点击屏幕开始', 5000);
    }, 500);

    console.log('[Main] 初始化完成');
  } catch (error) {
    console.error('[Main] 初始化失败:', error);
    showError(error.message);
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


