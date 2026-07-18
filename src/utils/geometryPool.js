/**
 * v25: 全局几何体缓存池
 * 相同参数（半径、分段）的 SphereGeometry / RingGeometry / ConeGeometry 复用
 * 减少内存占用和 GC 压力
 */
import * as THREE from 'three';

const pool = new Map();

function geoKey(type, ...params) {
  return `${type}:${params.join(',')}`;
}

/**
 * 获取或创建几何体（自动计数引用）
 * @param {string} type - 'sphere' | 'ring' | 'cone'
 * @param  {...any} params - 几何体构造函数参数
 * @returns {THREE.BufferGeometry}
 */
export function getGeometry(type, ...params) {
  const key = geoKey(type, ...params);
  let entry = pool.get(key);
  if (!entry) {
    let geo;
    switch (type) {
      case 'sphere':
        geo = new THREE.SphereGeometry(...params);
        break;
      case 'ring':
        geo = new THREE.RingGeometry(...params);
        break;
      case 'cone':
        geo = new THREE.ConeGeometry(...params);
        break;
      default:
        throw new Error(`[GeometryPool] 未知几何体类型: ${type}`);
    }
    entry = { geo, refs: 0 };
    pool.set(key, entry);
  }
  entry.refs++;
  return entry.geo;
}

/**
 * 释放引用（引用计数为零时真正 dispose）
 */
export function releaseGeometry(type, ...params) {
  const key = geoKey(type, ...params);
  const entry = pool.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    entry.geo.dispose();
    pool.delete(key);
  }
}

/** 释放所有缓存几何体 */
export function disposeAllGeometries() {
  pool.forEach(entry => entry.geo.dispose());
  pool.clear();
  console.log('[GeometryPool] 缓存已清空');
}
