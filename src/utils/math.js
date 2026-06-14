/**
 * 数学工具函数
 */

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 帧率无关的平滑过渡 (指数衰减)
 * @param {number} a 当前值
 * @param {number} b 目标值
 * @param {number} frameRate 60fps 时的 lerp 速率 (0~1)
 * @param {number} dt delta time (秒)
 * @returns {number} 下一帧的值
 */
export function dtLerp(a, b, frameRate, dt) {
  const rate = -60 * Math.log(1 - frameRate);
  return lerp(a, b, 1 - Math.exp(-rate * dt));
}

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function wrap(v, max) {
  return ((v % max) + max) % max;
}

export function easeOut(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * 二次贝塞尔插值
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {number} t 0~1
 */
export function quadraticBezier(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}
