/**
 * 全局确定性天体布局器
 * 用时间种子 + 全局防重叠，生成银河系中所有特殊天体的固定位置。
 * 位置基于银河中心（galaxyCenterGroup），不是相机。
 */

import * as THREE from 'three';
import { seededRandom } from './seededRandom.js';
import { config } from '../core/config.js';

/** 空间哈希网格，用于防重叠检测 */
class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize || 1000;
    this.map = new Map();
  }

  _key(x, y, z) {
    const ix = Math.round(x / this.cellSize);
    const iy = Math.round(y / this.cellSize);
    const iz = Math.round(z / this.cellSize);
    return `${ix},${iy},${iz}`;
  }

  insert(pos, data) {
    const key = this._key(pos.x, pos.y, pos.z);
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(data);
  }

  /** 检查 pos 周围是否与已有对象间距 >= minDist */
  isClear(pos, minDist) {
    const minDistSq = minDist * minDist;
    const cellR = Math.ceil(minDist / this.cellSize);
    const cx = Math.round(pos.x / this.cellSize);
    const cy = Math.round(pos.y / this.cellSize);
    const cz = Math.round(pos.z / this.cellSize);
    for (let dx = -cellR; dx <= cellR; dx++) {
      for (let dy = -cellR; dy <= cellR; dy++) {
        for (let dz = -cellR; dz <= cellR; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = this.map.get(key);
          if (!cell) continue;
          for (const entry of cell) {
            const ddx = pos.x - entry.pos.x;
            const ddy = pos.y - entry.pos.y;
            const ddz = pos.z - entry.pos.z;
            if (ddx * ddx + ddy * ddy + ddz * ddz < minDistSq) return false;
          }
        }
      }
    }
    return true;
  }
}

const _tempVec = new THREE.Vector3();

/**
 * 为所有天体分配固定位置
 * @param {THREE.Vector3} galaxyCenter - 银河中心世界坐标
 * @param {THREE.Vector3} solarSystemPos - 太阳系世界坐标（已转换到银心局部坐标）
 * @returns {{ blackhole: THREE.Vector3[], pulsar: THREE.Vector3[], nebula: THREE.Vector3[], planet: THREE.Vector3[] }}
 */
export function generateCelestialLayout(galaxyCenter, solarSystemPos) {
  const layout = config.celestialLayout;
  const bhCfg = config.blackhole;
  const psrCfg = config.pulsar;
  const nebCfg = config.nebula;
  const plCfg = config.planets;

  // 使用当前时间作为种子（每次刷新位置都不同）
  const masterSeed = layout.masterSeedFn ? layout.masterSeedFn() : Date.now();
  const rng = seededRandom(masterSeed);
  const grid = new SpatialGrid(2000);

  // 先注册排除区域
  const exclusionRegions = [];

  // 太阳系周围
  const localSolar = solarSystemPos.clone().sub(galaxyCenter);
  exclusionRegions.push({ pos: localSolar, radius: layout.solarExclusion || 8000, label: 'solar' });
  grid.insert(localSolar, { pos: localSolar, type: 'exclusion-solar' });

  // 银河核球周围
  exclusionRegions.push({ pos: new THREE.Vector3(0, 0, 0), radius: layout.bulgeExclusion || 5000, label: 'bulge' });
  grid.insert(new THREE.Vector3(0, 0, 0), { pos: new THREE.Vector3(0, 0, 0), type: 'exclusion-bulge' });

  const minBodyDist = layout.minBodyDistance || 3000;
  const result = { blackhole: [], pulsar: [], nebula: [], planet: [] };

  /** 在银河盘（XZ 平面）上生成一个候选位置 */
  function sampleDisk(rng, minR, maxR, yCompression = 0.3) {
    const theta = rng() * Math.PI * 2;
    const r = minR + rng() * (maxR - minR);
    const y = (rng() - 0.5) * maxR * 0.05 * yCompression;
    return new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
  }

  /** 尝试找到一个合法位置，最多尝试 N 次 */
  function tryPlace(rng, minR, maxR, yComp, attempts = 100) {
    for (let i = 0; i < attempts; i++) {
      const pos = sampleDisk(rng, minR, maxR, yComp);
      // 检查所有排除区域
      let ok = true;
      for (const ex of exclusionRegions) {
        if (pos.distanceTo(ex.pos) < ex.radius) { ok = false; break; }
      }
      if (!ok) continue;
      // 检查空间网格
      if (!grid.isClear(pos, minBodyDist)) continue;
      return pos;
    }
    // fallback: 直接随机，不做重叠检查
    return sampleDisk(rng, minR, maxR, yComp);
  }

  // ======== 黑洞（v29-fix: 在太阳系外部环上搜索合法位置） ========
  const bhCount = bhCfg.count || 1;
  const sunLocal = localSolar.clone(); // 太阳系在银心局部空间中的位置 (供 BH/脉冲星共用)
  const minDist = layout.minBodyDistance || 3000;
  for (let i = 0; i < bhCount; i++) {
    let pos = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = rng() * Math.PI * 2;
      const dist = 10000 + rng() * 15000;
      const testPos = new THREE.Vector3(
        localSolar.x + Math.cos(angle) * dist,
        (rng() - 0.5) * dist * 0.15,
        localSolar.z + Math.sin(angle) * dist
      );
      // 在太阳系排除区之外 + 不与其它天体重叠
      let ok = true;
      for (const ex of exclusionRegions) {
        if (testPos.distanceTo(ex.pos) < ex.radius * 0.9) { ok = false; break; }
      }
      if (!ok) continue;
      if (!grid.isClear(testPos, minDist)) continue;
      pos = testPos;
      break;
    }
    if (!pos) {
      // fallback：直接随机环
      const fAngle = rng() * Math.PI * 2;
      const fDist = 10000 + rng() * 15000;
      pos = new THREE.Vector3(localSolar.x + Math.cos(fAngle) * fDist,
        (rng() - 0.5) * fDist * 0.15, localSolar.z + Math.sin(fAngle) * fDist);
    }
    const seed = rng() * 0.5 + 0.25;
    result.blackhole.push({ position: pos, orbitPhase: seed });
    grid.insert(pos, { pos, type: 'blackhole' });
    exclusionRegions.push({ pos, radius: bhCfg.eventHorizonRadius * 10 || 250, label: 'bh' + i });
    console.log(`[CelestialLayout] BH${i} placed at [${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}]`);
  }

  // ======== 脉冲星（v26.2: 第1个放太阳系附近，其余随机分布） ========
  const psrCount = psrCfg.count || 3;
  for (let i = 0; i < psrCount; i++) {
    let pos;
    if (i === 0) {
      // 第1个脉冲星放在太阳系附近 8000~18000
      const dist = 8000 + rng() * 10000;
      const angle = rng() * Math.PI * 2;
      pos = new THREE.Vector3(
        sunLocal.x + Math.cos(angle) * dist,
        sunLocal.y + (rng() - 0.5) * dist * 0.2,
        sunLocal.z + Math.sin(angle) * dist
      );
      if (pos.distanceTo(sunLocal) < (layout.solarExclusion || 8000) * 0.8) {
        const rescale = (layout.solarExclusion || 8000) * 0.8 / Math.max(pos.distanceTo(sunLocal), 1);
        pos.sub(sunLocal).multiplyScalar(rescale).add(sunLocal);
      }
    } else {
      pos = tryPlace(rng, psrCfg.distFromCenterMin || 10000, psrCfg.distFromCenterMax || 36000, 0.25, 150);
    }
    const seed = rng() * 0.5 + 0.25;
    result.pulsar.push({ position: pos, orbitPhase: seed });
    grid.insert(pos, { pos, type: 'pulsar' });
    exclusionRegions.push({ pos, radius: psrCfg.beamLength || 300, label: 'psr' + i });
  }

  // ======== 星云 ========
  const nebCount = nebCfg.count || 3;
  for (let i = 0; i < nebCount; i++) {
    const pos = tryPlace(rng, nebCfg.distFromCenterMin || 15000, nebCfg.distFromCenterMax || 50000, 0.15, 100);
    const seed = rng();
    result.nebula.push({ position: pos, rotSeed: seed });
    grid.insert(pos, { pos, type: 'nebula' });
    exclusionRegions.push({ pos, radius: nebCfg.scale || 2000, label: 'neb' + i });
  }

  // ======== 随机行星 ========
  const plCount = plCfg.count || 4;
  for (let i = 0; i < plCount; i++) {
    const pos = tryPlace(rng, plCfg.distFromCenterMin || 5000, plCfg.distFromCenterMax || 40000, 0.3, 150);
    result.planet.push({ position: pos });
    grid.insert(pos, { pos, type: 'planet' });
    exclusionRegions.push({ pos, radius: (plCfg.maxRadius || 200) * 5, label: 'planet' + i });
  }

  console.log(`[CelestialLayout] seed=${masterSeed}, bh=${bhCount}, psr=${psrCount}, neb=${nebCount}, pl=${plCount}`);
  return result;
}

/**
 * 计算绕银河中心公转的世界位置
 */
export function applyGalacticOrbit(localPos, orbitPhase, orbitSpeed, elapsed, galaxyCenter) {
  const angle = orbitPhase * Math.PI * 2 + elapsed * orbitSpeed;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new THREE.Vector3(
    galaxyCenter.x + localPos.x * cos - localPos.z * sin,
    galaxyCenter.y + localPos.y,
    galaxyCenter.z + localPos.x * sin + localPos.z * cos
  );
}
