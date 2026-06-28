/**
 * HUD 系统
 * 显示准星、速度、FPS、黑洞警告、跃迁特效
 */

export class HUD {
  constructor() {
    this.elements = {};
    this.messageTimeout = null;
    this.isWarpActive = false;
    this.dangerLevel = 0;
    // 缓存 DOM 引用，避免每帧 getElementById
    this._fpsEl = null;
    this._speedEl = null;
    this._posEl = null;
  }

  init() {
    this.createCrosshair();
    this.createInfoPanel();
    this.createMessage();
    this.createControlsHint();
    this.createDangerOverlay();
    this.createCelestialInfo();

    // 缓存常用 DOM 引用
    this._fpsEl = document.getElementById('fps');
    this._speedEl = document.getElementById('speed');
    this._posEl = document.getElementById('position');
    this._warpEl = document.getElementById('warp-indicator');

    console.log('[HUD] HUD 初始化完成');
  }

  createCrosshair() {
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    crosshair.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 40 40">
        <!-- 外圈 - 脉冲动画 -->
        <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(100,180,255,0.15)" stroke-width="0.5">
          <animate attributeName="r" values="14;16;14" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.15;0.3;0.15" dur="2s" repeatCount="indefinite"/>
        </circle>
        <!-- 内圈 -->
        <circle cx="20" cy="20" r="8" fill="none" stroke="rgba(150,200,255,0.3)" stroke-width="0.5"/>
        <!-- 中心点 -->
        <circle cx="20" cy="20" r="1.5" fill="rgba(200,220,255,0.8)"/>
        <!-- 十字线 - 断开设计 -->
        <line x1="20" y1="5" x2="20" y2="13" stroke="rgba(150,200,255,0.5)" stroke-width="1"/>
        <line x1="20" y1="27" x2="20" y2="35" stroke="rgba(150,200,255,0.5)" stroke-width="1"/>
        <line x1="5" y1="20" x2="13" y2="20" stroke="rgba(150,200,255,0.5)" stroke-width="1"/>
        <line x1="27" y1="20" x2="35" y2="20" stroke="rgba(150,200,255,0.5)" stroke-width="1"/>
        <!-- 角标 -->
        <path d="M 12 8 L 8 8 L 8 12" fill="none" stroke="rgba(100,150,255,0.3)" stroke-width="0.5"/>
        <path d="M 28 8 L 32 8 L 32 12" fill="none" stroke="rgba(100,150,255,0.3)" stroke-width="0.5" transform="rotate(0)"/>
        <path d="M 12 32 L 8 32 L 8 28" fill="none" stroke="rgba(100,150,255,0.3)" stroke-width="0.5"/>
        <path d="M 28 32 L 32 32 L 32 28" fill="none" stroke="rgba(100,150,255,0.3)" stroke-width="0.5"/>
      </svg>
    `;
    this.applyStyles(crosshair, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '1000',
      pointerEvents: 'none',
      filter: 'drop-shadow(0 0 6px rgba(100, 150, 255, 0.3))',
      transition: 'filter 0.3s ease',
    });
    document.body.appendChild(crosshair);
    this.elements.crosshair = crosshair;
  }

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
      lineHeight: '1.8',
      zIndex: '1000',
      pointerEvents: 'none',
      padding: '12px 16px',
      background: 'linear-gradient(135deg, rgba(10, 20, 40, 0.4), rgba(5, 10, 20, 0.2))',
      border: '1px solid rgba(100, 150, 255, 0.15)',
      borderRadius: '4px',
      backdropFilter: 'blur(4px)',
      minWidth: '180px',
    });
    panel.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 6px;">
        <span style="color: rgba(100, 150, 255, 0.4); font-size: 9px; letter-spacing: 3px; text-transform: uppercase;">系统状态</span>
      </div>
      <div id="fps" style="color: rgba(100, 255, 150, 0.7);">FPS: --</div>
      <div id="speed" style="color: rgba(150, 200, 255, 0.8);">速度: 0.0</div>
      <div id="position" style="color: rgba(200, 200, 255, 0.6); font-size: 11px;">位置: 0, 0, 0</div>
      <div id="warp-indicator" style="display:none; color: rgba(100, 200, 255, 0.9); font-size: 11px; letter-spacing: 3px; margin-top: 4px; text-shadow: 0 0 8px rgba(100, 200, 255, 0.5);">▶ WARP</div>
    `;
    document.body.appendChild(panel);
    this.elements.panel = panel;
  }

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
      textShadow: '0 0 20px rgba(100, 150, 255, 0.5), 0 0 40px rgba(100, 150, 255, 0.2)',
      textAlign: 'center',
      maxWidth: '600px',
    });
    document.body.appendChild(message);
    this.elements.message = message;
  }

  createControlsHint() {
    const hint = document.createElement('div');
    hint.id = 'controls-hint';
    this.applyStyles(hint, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(150, 180, 220, 0.4)',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '10px',
      letterSpacing: '2px',
      zIndex: '1000',
      pointerEvents: 'none',
      textAlign: 'center',
      padding: '6px 16px',
      border: '1px solid rgba(100, 150, 255, 0.08)',
      borderRadius: '2px',
    });
    hint.innerHTML = 'WASD 移动 · 鼠标 视角 · 空格 上升 · C 下降 · Shift 冲刺 · P 暂停';
    document.body.appendChild(hint);
    this.elements.hint = hint;
  }

  createDangerOverlay() {
    const danger = document.createElement('div');
    danger.id = 'danger-overlay';
    this.applyStyles(danger, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '997',
      opacity: '0',
      transition: 'opacity 0.3s ease',
      background: 'radial-gradient(ellipse at center, transparent 40%, rgba(255, 30, 30, 0.15) 100%)',
    });
    document.body.appendChild(danger);
    this.elements.dangerOverlay = danger;

    // 警告文字
    const warning = document.createElement('div');
    warning.id = 'danger-warning';
    this.applyStyles(warning, {
      position: 'fixed',
      top: '15%',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'rgba(255, 80, 80, 0.8)',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '14px',
      letterSpacing: '4px',
      zIndex: '1001',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.3s ease',
      textShadow: '0 0 20px rgba(255, 50, 50, 0.5)',
      textTransform: 'uppercase',
    });
    warning.textContent = '⚠ 引力异常区域 ⚠';
    document.body.appendChild(warning);
    this.elements.dangerWarning = warning;
  }

  // v11: 天体信息面板
  createCelestialInfo() {
    const panel = document.createElement('div');
    panel.id = 'celestial-info';
    this.applyStyles(panel, {
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      color: 'rgba(180, 210, 255, 0.9)',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '12px',
      lineHeight: '1.8',
      zIndex: '1000',
      pointerEvents: 'none',
      padding: '14px 20px',
      background: 'linear-gradient(135deg, rgba(10, 20, 40, 0.5), rgba(5, 10, 20, 0.3))',
      border: '1px solid rgba(100, 150, 255, 0.2)',
      borderRadius: '6px',
      backdropFilter: 'blur(6px)',
      opacity: '0',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
      transform: 'translateY(10px)',
      maxWidth: '280px',
    });
    panel.innerHTML = `
      <div id="celestial-name" style="font-size: 14px; font-weight: bold; color: rgba(100, 200, 255, 0.95); margin-bottom: 4px;"></div>
      <div id="celestial-type" style="font-size: 10px; color: rgba(150, 180, 220, 0.6); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;"></div>
      <div id="celestial-details" style="color: rgba(160, 190, 230, 0.7); font-size: 11px;"></div>
    `;
    document.body.appendChild(panel);
    this.elements.celestialInfo = panel;
    this._celestialInfoVisible = false;
  }

  showCelestialInfo(name, type, details) {
    const panel = this.elements.celestialInfo;
    if (!panel) return;
    const nameEl = panel.querySelector('#celestial-name');
    const typeEl = panel.querySelector('#celestial-type');
    const detailsEl = panel.querySelector('#celestial-details');
    if (nameEl) nameEl.textContent = `◆ ${name}`;
    if (typeEl) typeEl.textContent = type;
    if (detailsEl) detailsEl.innerHTML = details;
    if (!this._celestialInfoVisible) {
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
      this._celestialInfoVisible = true;
    }
  }

  hideCelestialInfo() {
    const panel = this.elements.celestialInfo;
    if (!panel || !this._celestialInfoVisible) return;
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(10px)';
    this._celestialInfoVisible = false;
  }

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

  updateFPS(fps) {
    if (this._fpsEl) {
      this._fpsEl.textContent = `FPS: ${fps}`;
      if (fps >= 50) {
        this._fpsEl.style.color = 'rgba(100, 255, 150, 0.7)';
      } else if (fps >= 30) {
        this._fpsEl.style.color = 'rgba(255, 200, 100, 0.7)';
      } else {
        this._fpsEl.style.color = 'rgba(255, 100, 100, 0.7)';
      }
    }
  }

  updateSpeed(speed) {
    if (this._speedEl) {
      this._speedEl.textContent = `速度: ${speed.toFixed(1)}`;
      if (speed > 100) {
        this.elements.crosshair.style.filter = 'drop-shadow(0 0 12px rgba(100, 150, 255, 0.6))';
      } else {
        this.elements.crosshair.style.filter = 'drop-shadow(0 0 6px rgba(100, 150, 255, 0.3))';
      }
    }
  }

  updatePosition(x, y, z) {
    if (this._posEl) {
      this._posEl.textContent = `位置: ${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}`;
    }
  }

  /**
   * 更新跃迁特效
   */
  updateWarpEffect(speed, threshold) {
    const isActive = speed > threshold;
    if (isActive !== this.isWarpActive) {
      this.isWarpActive = isActive;
      if (isActive) {
        document.body.classList.add('warp-active');
      } else {
        document.body.classList.remove('warp-active');
      }
    }
  }

  /**
   * 更新黑洞危险等级
   */
  updateDanger(level) {
    if (Math.abs(level - this.dangerLevel) < 0.01) return;
    this.dangerLevel = level;

    const overlay = this.elements.dangerOverlay;
    const warning = this.elements.dangerWarning;

    if (level > 0.1) {
      overlay.style.opacity = String(level * 0.8);
      warning.style.opacity = String(Math.min(1, level * 1.5));

      // 警告文字闪烁频率随危险等级变化
      const blinkSpeed = Math.max(0.3, 1.5 - level);
      warning.style.animation = `danger-blink ${blinkSpeed}s ease-in-out infinite`;

      document.body.classList.add('danger-zone');
    } else {
      overlay.style.opacity = '0';
      warning.style.opacity = '0';
      warning.style.animation = 'none';
      document.body.classList.remove('danger-zone');
    }
  }

  /**
   * 更新冲刺指示器
   */
  updateSprint(isSprinting) {
    if (this._warpEl) {
      this._warpEl.style.display = isSprinting ? 'block' : 'none';
    }
  }

  update(delta) {
    // 实时更新逻辑可在此扩展
  }

  applyStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  dispose() {
    document.body.classList.remove('warp-active', 'danger-zone');
    Object.values(this.elements).forEach((el) => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  }
}
