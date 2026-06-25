/**
 * 输入管理器（已废弃）
 * PlayerController 直接管理按键状态，无需此模块。
 * 保留文件仅用于向后兼容。
 */
export class InputManager {
  constructor() {
    console.warn('[InputManager] 已废弃 — 按键管理已合并到 PlayerController');
  }
  init() {}
  dispose() {}
  isKeyDown() { return false; }
}
