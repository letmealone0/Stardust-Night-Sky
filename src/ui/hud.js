/**
 * HUD 系统
 * 显示准星、速度、FPS 等信息
 */

export class HUD {
  constructor() {
    this.elements = {};
    this.messageTimeout = null;
  }

  /**
   * 初始化 HUD
   */
  init() {
    // 创建准星
    this.createCrosshair();

    // 创建信息面板
    this.createInfoPanel();

    // 创建消息提示
    this.createMessage();

    // 创建操作提示
    this.createControlsHint();

    console.log('[HUD] HUD 初始化完成');
  }

  /**
   * 创建准星
   */
  createCrosshair() {
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    crosshair.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="2" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
        <line x1="12" y1="4" x2="12" y2="8" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
        <line x1="12" y1="16" x2="12" y2="20" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
        <line x1="4" y1="12" x2="8" y2="12" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
        <line x1="16" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
      </svg>
    `;
    this.applyStyles(crosshair, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '1000',
      pointerEvents: 'none',
      opacity: '0.6',
    });
    document.body.appendChild(crosshair);
    this.elements.crosshair = crosshair;
  }

  /**
   * 创建信息面板
   */
  createInfoPanel() {
    const panel = document.createElement('div');
    panel.id = 'info-panel';
    this.applyStyles(panel, {
      position: 'fixed',
      top: '20px',
      left: '20px',
      color: 'rgba(150, 200, 255, 0.8)',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '12px',
      lineHeight: '1.6',
      zIndex: '1000',
      pointerEvents: 'none',
      textShadow: '0 0 10px rgba(100, 150, 255, 0.3)',
    });
    panel.innerHTML = `
      <div id="fps">FPS: --</div>
      <div id="speed">速度: 0.0</div>
      <div id="position">位置: 0, 0, 0</div>
    `;
    document.body.appendChild(panel);
    this.elements.panel = panel;
  }

  /**
   * 创建消息提示
   */
  createMessage() {
    const message = document.createElement('div');
    message.id = 'message';
    this.applyStyles(message, {
      position: 'fixed',
      bottom: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(200, 220, 255, 0.9)',
      fontFamily: "'Inter', 'Poppins', sans-serif",
      fontSize: '14px',
      letterSpacing: '2px',
      zIndex: '1000',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.5s ease',
      textShadow: '0 0 20px rgba(100, 150, 255, 0.5)',
    });
    document.body.appendChild(message);
    this.elements.message = message;
  }

  /**
   * 创建操作提示
   */
  createControlsHint() {
    const hint = document.createElement('div');
    hint.id = 'controls-hint';
    this.applyStyles(hint, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(150, 180, 220, 0.6)',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '11px',
      letterSpacing: '1px',
      zIndex: '1000',
      pointerEvents: 'none',
      textAlign: 'center',
    });
    hint.innerHTML = 'WASD 移动 | 鼠标 视角 | 空格 上升 | Shift 下降 | Ctrl 冲刺';
    document.body.appendChild(hint);
    this.elements.hint = hint;
  }

  /**
   * 显示消息
   */
  showMessage(text, duration = 3000) {
    const message = this.elements.message;
    message.textContent = text;
    message.style.opacity = '1';

    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    this.messageTimeout = setTimeout(() => {
      message.style.opacity = '0';
    }, duration);
  }

  /**
   * 更新 FPS
   */
  updateFPS(fps) {
    const fpsElement = document.getElementById('fps');
    if (fpsElement) {
      fpsElement.textContent = `FPS: ${fps}`;
    }
  }

  /**
   * 更新速度
   */
  updateSpeed(speed) {
    const speedElement = document.getElementById('speed');
    if (speedElement) {
      speedElement.textContent = `速度: ${speed.toFixed(1)}`;
    }
  }

  /**
   * 更新位置
   */
  updatePosition(x, y, z) {
    const positionElement = document.getElementById('position');
    if (positionElement) {
      positionElement.textContent = `位置: ${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}`;
    }
  }

  /**
   * 更新 HUD
   */
  update(delta) {
    // 这里可以添加实时更新逻辑
  }

  /**
   * 应用样式
   */
  applyStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  /**
   * 销毁 HUD
   */
  dispose() {
    Object.values(this.elements).forEach((el) => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  }
}
