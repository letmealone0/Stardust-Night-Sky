/**
 * 输入管理器
 * 管理全局输入状态
 */

export class InputManager {
  constructor() {
    this.keys = {};
    this.mouse = {
      x: 0,
      y: 0,
      isDown: false,
    };
  }

  /**
   * 初始化输入管理
   */
  init() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));

    console.log('[InputManager] 输入管理初始化完成');
  }

  /**
   * 键盘按下
   */
  onKeyDown(event) {
    this.keys[event.code] = true;
  }

  /**
   * 键盘抬起
   */
  onKeyUp(event) {
    this.keys[event.code] = false;
  }

  /**
   * 鼠标移动
   */
  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  /**
   * 鼠标按下
   */
  onMouseDown(event) {
    this.mouse.isDown = true;
  }

  /**
   * 鼠标抬起
   */
  onMouseUp(event) {
    this.mouse.isDown = false;
  }

  /**
   * 检查按键是否按下
   */
  isKeyDown(code) {
    return this.keys[code] === true;
  }

  /**
   * 销毁输入管理
   */
  dispose() {
    // 事件监听器会自动被垃圾回收
  }
}
