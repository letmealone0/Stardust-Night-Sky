/**
 * v25: GLSL 公共代码库
 * 统一的噪声函数、通用工具函数，所有着色器复用
 * 避免在多个文件中重复粘贴 GLSL 代码
 */
export const GLSL = {
  /** 3D 哈希 */
  HASH3D: `
float hash3D(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}`,

  /** 3D 值噪声 */
  NOISE3D: `
float hash3D(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3D(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3D(i), hash3D(i+vec3(1,0,0)), f.x),
        mix(hash3D(i+vec3(0,1,0)), hash3D(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3D(i+vec3(0,0,1)), hash3D(i+vec3(1,0,1)), f.x),
        mix(hash3D(i+vec3(0,1,1)), hash3D(i+vec3(1,1,1)), f.x), f.y), f.z);
}`,

  /** 5-octave FBM */
  FBM5: `
float hash3D(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3D(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3D(i),hash3D(i+vec3(1,0,0)),f.x),mix(hash3D(i+vec3(0,1,0)),hash3D(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3D(i+vec3(0,0,1)),hash3D(i+vec3(1,0,1)),f.x),mix(hash3D(i+vec3(0,1,1)),hash3D(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm5(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int j = 0; j < 5; j++) { v += a * noise3D(p); p = p * 2.2 + 73.0; a *= 0.48; }
  return v;
}`,

  /** 3-octave 平滑 FBM */
  FBM3_SMOOTH: `
float hash3D(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3D(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3D(i),hash3D(i+vec3(1,0,0)),f.x),mix(hash3D(i+vec3(0,1,0)),hash3D(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3D(i+vec3(0,0,1)),hash3D(i+vec3(1,0,1)),f.x),mix(hash3D(i+vec3(0,1,1)),hash3D(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbmSmooth(vec3 p) {
  float v = 0.0, a = 0.55;
  for (int j = 0; j < 3; j++) { v += a * noise3D(p); p = p * 2.6 + 57.0; a *= 0.35; }
  return v;
}`,

  /** 2D Simplex 噪声（用于日冕/环纹等） */
  SIMPLEX2D: `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`,

  /** ACES 色调映射 */
  ACES_TONEMAP: `
vec3 acesFilm(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}`,

  /** 颜色分级（冷色深空 + 暖色天体） */
  COLOR_GRADE: `
vec3 colorGrade(vec3 color, float exposure) {
  // 自动曝光
  color *= exposure;
  // 增强冷暖对比
  float warmth = dot(color, vec3(0.4, 0.3, 0.3));
  vec3 coolShift = vec3(0.95, 0.97, 1.08);  // 微冷
  vec3 warmShift = vec3(1.05, 1.02, 0.92);  // 微暖
  color = mix(color * coolShift, color * warmShift, smoothstep(0.1, 0.6, warmth));
  // 微微饱和度增强
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(lum), color, 1.08);
  return color;
}`,
};
