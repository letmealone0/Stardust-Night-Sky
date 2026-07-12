/**
 * 空间距离检测工具
 * 用于防止星体重叠，确保随机生成的天体保持合理间距
 */

import * as THREE from 'three';

const _tempVec = new THREE.Vector3();

/**
 * 检查新位置是否与现有位置列表保持足够距离
 * @param {THREE.Vector3} newPos - 候选位置
 * @param {Array<THREE.Vector3>} existingPositions - 已有位置列表
 * @param {number} minDistance - 最小安全距离
 * @returns {boolean} true=位置合法，false=太近
 */
export function isPositionValid(newPos, existingPositions, minDistance) {
  const minDistSq = minDistance * minDistance;
  for (let i = 0; i < existingPositions.length; i++) {
    const p = existingPositions[i];
    if (!p) continue;
    const dx = newPos.x - p.x;
    const dy = newPos.y - p.y;
    const dz = newPos.z - p.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < minDistSq) return false;
  }
  return true;
}

/**
 * 在球壳范围内找到一个合法位置（与所有现有位置保持最小距离）
 * @param {Array<THREE.Vector3>} existingPositions - 已有位置列表
 * @param {number} minDistance - 最小安全距离
 * @param {THREE.Vector3} center - 中心点（通常是相机位置）
 * @param {number} minRange - 最小距离（离中心）
 * @param {number} maxRange - 最大距离（离中心）
 * @param {number} maxAttempts - 最大重试次数
 * @param {number} yCompression - Y轴压缩系数（默认0.3，避免太高太低）
 * @returns {THREE.Vector3|null} 合法位置，或 null（找不到）
 */
export function findValidPosition(
  existingPositions,
  minDistance,
  center,
  minRange,
  maxRange,
  maxAttempts = 30,
  yCompression = 0.3
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = minRange + Math.random() * (maxRange - minRange);

    _tempVec.set(
      center.x + r * Math.sin(phi) * Math.cos(theta),
      center.y + r * Math.sin(phi) * Math.sin(theta) * yCompression,
      center.z + r * Math.cos(phi)
    );

    if (isPositionValid(_tempVec, existingPositions, minDistance)) {
      return _tempVec.clone();
    }
  }
  return null;
}

/**
 * 批量收集所有已知星体的世界位置
 * 用于全局防重叠检测
 * @param {object} sceneObjects - SceneManager.objects
 * @returns {Array<THREE.Vector3>}
 */
export function collectAllPositions(sceneObjects) {
  const positions = [];

  // 太阳系（太阳在原点）
  if (sceneObjects.solarSystem) {
    positions.push(new THREE.Vector3(0, 0, 0));
  }

  // 黑洞（v25: 支持多个）
  if (sceneObjects.blackholes) {
    sceneObjects.blackholes.forEach(bh => {
      if (bh.group) positions.push(bh.group.position.clone());
    });
  }

  // 脉冲星（v25: 支持多个）
  if (sceneObjects.pulsars) {
    sceneObjects.pulsars.forEach(psr => {
      if (psr.group) positions.push(psr.group.position.clone());
    });
  }

  // 随机行星
  if (sceneObjects.planets && sceneObjects.planets.planets) {
    sceneObjects.planets.planets.forEach(p => {
      if (p && p.position) positions.push(p.position.clone());
    });
  }

  // 星云
  if (sceneObjects.nebula && sceneObjects.nebula.nebulae) {
    sceneObjects.nebula.nebulae.forEach(n => {
      if (n && n.position) positions.push(n.position.clone());
    });
  }

  return positions;
}
