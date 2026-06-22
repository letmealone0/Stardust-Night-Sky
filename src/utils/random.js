/**
 * 随机数工具函数
 */

import * as THREE from 'three';

/**
 * 生成指定范围内的随机数
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * 生成指定范围内的随机整数
 */
export function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

/**
 * 从数组中随机选择一个元素
 */
export function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * 生成随机颜色
 */
export function randomColor(minHue = 0, maxHue = 1) {
  const hue = randomRange(minHue, maxHue);
  const saturation = randomRange(0.5, 1.0);
  const lightness = randomRange(0.5, 0.8);
  return new THREE.Color().setHSL(hue, saturation, lightness);
}

/**
 * 生成随机向量
 */
export function randomVector3(range) {
  return new THREE.Vector3(
    randomRange(-range, range),
    randomRange(-range, range),
    randomRange(-range, range)
  );
}
