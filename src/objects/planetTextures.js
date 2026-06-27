/**
 * v9.0: 行星PBR纹理加载与生成
 * 真实天文纹理 + 程序化生成 normalMap / roughnessMap
 */
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();

/** 纹理注册表: 定义每个行星需要的纹理 */
const TEXTURE_MANIFEST = {
  Sun:     { albedo: 'sun.jpg' },
  Mercury: { albedo: 'mercury.jpg' },
  Venus:   { albedo: 'venus.jpg' },
  Earth:   { albedo: 'earth_day.jpg', clouds: 'earth_clouds.jpg' },
  Mars:    { albedo: 'mars.jpg' },
  Jupiter: { albedo: 'jupiter.jpg' },
  Saturn:  { albedo: 'saturn.jpg' },
  Uranus:  { albedo: 'uranus.jpg' },
  Neptune: { albedo: 'neptune.jpg' },
};

const BASE = '/textures/planets/';

/**
 * 从albedo贴图生成法线贴图 (Sobel边缘检测)
 */
function generateNormalMap(albedoImg) {
  const w = albedoImg.width, h = albedoImg.height;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(albedoImg, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const l = (x - 1 + y * w) * 4, r = (x + 1 + y * w) * 4;
      const t = (x + (y - 1) * w) * 4, b = (x + (y + 1) * w) * 4;
      // 亮度转灰阶
      const gray = (i) => src.data[i] * 0.299 + src.data[i + 1] * 0.587 + src.data[i + 2] * 0.114;
      const dx = gray(r) - gray(l);
      const dy = gray(b) - gray(t);
      const strength = 6.0;
      const nx = -dx * strength / 255 + 0.5;
      const ny = -dy * strength / 255 + 0.5;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      dst.data[idx]     = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      dst.data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      dst.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      dst.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * 从albedo贴图生成粗糙度贴图 (亮度→粗糙度映射)
 */
function generateRoughnessMap(albedoImg, isRocky) {
  const w = albedoImg.width, h = albedoImg.height;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(albedoImg, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = src.data[idx] * 0.299 + src.data[idx + 1] * 0.587 + src.data[idx + 2] * 0.114;
      // 岩石行星: 亮=粗糙, 暗=光滑; 气态: 整体光滑
      const rough = isRocky ? (0.4 + (lum / 255) * 0.5) : (0.2 + (lum / 255) * 0.2);
      const v = Math.round(Math.max(0, Math.min(1, rough)) * 255);
      dst.data[idx] = v;
      dst.data[idx + 1] = v;
      dst.data[idx + 2] = v;
      dst.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * 加载单个行星的完整纹理集
 */
async function loadPlanetTextures(name) {
  const manifest = TEXTURE_MANIFEST[name];
  if (!manifest) return null;

  const result = { name };

  // 加载albedo
  const albedoUrl = BASE + manifest.albedo;
  result.map = await new Promise((resolve, reject) => {
    loader.load(albedoUrl, resolve, undefined, () => {
      console.warn(`[Textures] 无法加载 ${albedoUrl}, 使用占位纹理`);
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 64, 64);
      resolve(new THREE.CanvasTexture(c));
    });
  });

  // 加载云层 (仅地球)
  if (manifest.clouds) {
    result.cloudMap = await new Promise((resolve) => {
      loader.load(BASE + manifest.clouds, resolve, undefined, () => resolve(null));
    });
  }

  // 用Image获取像素数据用于生成法线/粗糙度
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => { console.warn(`[Textures] ${name} albedo图片加载失败`); resolve(); };
    img.src = albedoUrl;
  });

  if (img.width > 0) {
    // 岩石行星 vs 气态行星
    const rocky = ['Mercury', 'Venus', 'Earth', 'Mars'].includes(name);
    result.normalMap = generateNormalMap(img);
    result.roughnessMap = generateRoughnessMap(img, rocky);
  }

  return result;
}

/**
 * 预加载所有行星纹理
 */
export async function loadAllPlanetTextures() {
  const names = Object.keys(TEXTURE_MANIFEST);
  const results = await Promise.all(names.map(n => loadPlanetTextures(n)));
  results.forEach(r => { if (r) cache.set(r.name, r); });
  console.log('[PlanetTextures] 纹理加载完成:', cache.size, '个行星');
  return cache;
}

/** 获取已缓存的纹理 */
export function getPlanetTextures(name) {
  return cache.get(name) || null;
}
