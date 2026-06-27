/**
 * 噪声工具函数
 * 用于程序化生成行星纹理
 */

// 简易 2D 值噪声（无需外部依赖）
// 基于 sin 哈希，适合 Canvas 2D 纹理生成

function _hash(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function _smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * 2D 值噪声
 * @param {number} x
 * @param {number} y
 * @returns {number} 0~1
 */
export function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = _smooth(fx);
  const sy = _smooth(fy);

  const a = _hash(ix, iy);
  const b = _hash(ix + 1, iy);
  const c = _hash(ix, iy + 1);
  const d = _hash(ix + 1, iy + 1);

  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * 3D 值噪声（用于球面映射，减少极点失真）
 */
function _hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export function noise3D(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = _smooth(x - ix);
  const fy = _smooth(y - iy);
  const fz = _smooth(z - iz);

  const n000 = _hash3(ix, iy, iz);
  const n100 = _hash3(ix + 1, iy, iz);
  const n010 = _hash3(ix, iy + 1, iz);
  const n110 = _hash3(ix + 1, iy + 1, iz);
  const n001 = _hash3(ix, iy, iz + 1);
  const n101 = _hash3(ix + 1, iy, iz + 1);
  const n011 = _hash3(ix, iy + 1, iz + 1);
  const n111 = _hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * fx;
  const nx10 = n010 + (n110 - n010) * fx;
  const nx01 = n001 + (n101 - n001) * fx;
  const nx11 = n011 + (n111 - n011) * fx;

  const nxy0 = nx00 + (nx10 - nx00) * fy;
  const nxy1 = nx01 + (nx11 - nx01) * fy;

  return nxy0 + (nxy1 - nxy0) * fz;
}

/**
 * FBM（分形布朗运动）— 多层噪声叠加
 * @param {number} x
 * @param {number} y
 * @param {number} octaves 层数
 * @param {number} lacunarity 频率倍增
 * @param {number} persistence 振幅衰减
 * @returns {number} 0~1
 */
export function fbm2D(x, y, octaves = 6, lacunarity = 2.0, persistence = 0.5) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * 3D FBM（球面映射用）
 */
export function fbm3D(x, y, z, octaves = 6, lacunarity = 2.0, persistence = 0.5) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Turbulence（绝对值噪声叠加，产生更尖锐的特征）
 */
export function turbulence2D(x, y, octaves = 6, lacunarity = 2.0, persistence = 0.5) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += Math.abs(noise2D(x * frequency, y * frequency) * 2 - 1) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}
