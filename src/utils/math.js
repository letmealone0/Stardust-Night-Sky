/**
 * 数学工具函数
 */

/**
 * 线性插值
 */
export function lerp(start, end, t) {
  return start + (end - start) * t;
}

/**
 * 限制范围
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * 平滑插值
 */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 角度转弧度
 */
export function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * 弧度转角度
 */
export function radToDeg(radians) {
  return radians * (180 / Math.PI);
}

/**
 * 距离计算
 */
export function distance(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 预生成的置换表（模块级常量，避免每次调用重新生成）
const _perm = new Uint8Array(512);
{
  for (let i = 0; i < 256; i++) _perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [_perm[i], _perm[j]] = [_perm[j], _perm[i]];
  }
  for (let i = 0; i < 256; i++) _perm[i + 256] = _perm[i];
}

const _fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const _grad = (hash, x, y, z) => {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

/**
 * 噪声函数（简单 Perlin 噪声）
 */
export function noise(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;

  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);

  const u = _fade(x);
  const v = _fade(y);
  const w = _fade(z);

  const A = _perm[X] + Y;
  const AA = _perm[A] + Z;
  const AB = _perm[A + 1] + Z;
  const B = _perm[X + 1] + Y;
  const BA = _perm[B] + Z;
  const BB = _perm[B + 1] + Z;

  return lerp(
    lerp(
      lerp(_grad(_perm[AA], x, y, z), _grad(_perm[BA], x - 1, y, z), u),
      lerp(_grad(_perm[AB], x, y - 1, z), _grad(_perm[BB], x - 1, y - 1, z), u),
      v
    ),
    lerp(
      lerp(_grad(_perm[AA + 1], x, y, z - 1), _grad(_perm[BA + 1], x - 1, y, z - 1), u),
      lerp(_grad(_perm[AB + 1], x, y - 1, z - 1), _grad(_perm[BB + 1], x - 1, y - 1, z - 1), u),
      v
    ),
    w
  );
}
