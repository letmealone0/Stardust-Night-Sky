/**
 * 确定性随机数工具
 * 基于种子的伪随机，保证相同输入产生相同输出
 */

// 基于坐标的哈希，生成种子
export function hashCoords(cx, cy, cz) {
  let h = cx * 374761393 + cy * 668265263 + cz * 1274126177;
  h = (h ^ (h >> 13)) * 1103515245;
  h = (h ^ (h >> 16));
  return h & 0x7fffffff;
}

// 种子化的伪随机数生成器
export function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
