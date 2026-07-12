/**
 * NebulaSystem v23 — 深空摄影级星云渲染
 *
 * v23 改进：
 * - 统一拉伸轴：init 生成 stretchAxis 传入 CPU 粒子生成和所有 Shader 层
 * - 新增中层暗纹 dustMid（outer/mid 之间，MultiplyBlending，模拟气体内尘埃）
 * - LOD 平滑淡出：uLodFade + 距离衰减替代硬截断，远距离自然过渡
 * - 整体压暗：外层-30%/中层-25%/内层-22%，告别荧光感
 * - 软粒子效果：depthTest=false + 增强径向柔化，消除硬边
 * - 各向异性纤维噪声：沿拉伸轴方向拉长丝缕纹理，边缘破碎
 * - 5 色阶噪声扰动（+灰褐过渡），冷暖对比更强
 * - 虚拟光源动态化：缓慢漂移+呼吸脉动，光照权重 +50%
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

// ---- GLSL 噪声（v23: 5-octave FBM + 各向异性纤维噪声）----
const NOISE_GLSL = `
float hash3D(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3D(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3D(i),hash3D(i+vec3(1,0,0)),f.x),mix(hash3D(i+vec3(0,1,0)),hash3D(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3D(i+vec3(0,0,1)),hash3D(i+vec3(1,0,1)),f.x),mix(hash3D(i+vec3(0,1,1)),hash3D(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p) { float v=0.0,a=0.5; for(int j=0;j<5;j++){v+=a*noise3D(p);p=p*2.2+73.0;a*=0.48;} return v; }
float fbmSmooth(vec3 p) { float v=0.0,a=0.55; for(int j=0;j<3;j++){v+=a*noise3D(p);p=p*2.6+57.0;a*=0.35;} return v; }
// v23: 各向异性噪声 — 沿 fiberAxis 拉伸的纤维纹理
float fiberNoise(vec3 p, vec3 fiberAxis) {
  float along = dot(p, fiberAxis);
  vec3 perp = p - fiberAxis * along;
  // 压缩轴向、拉伸径向，制造细长纤维
  vec3 aniso = fiberAxis * along * 0.35 + perp * 3.2;
  return fbm3(aniso);
}
`;

// CPU端 FBM 噪声（用于粒子位置过滤，v22: 提高频率打破球形）
function _cpuNoise3D(x, y, z) {
  const hash = (p) => { const n = Math.sin(p * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const mix2 = (a, b, t) => a + (b - a) * t;
  return mix2(
    mix2(mix2(hash(ix+iy*31+iz*71), hash(ix+1+iy*31+iz*71), sx),
         mix2(hash(ix+(iy+1)*31+iz*71), hash(ix+1+(iy+1)*31+iz*71), sx), sy),
    mix2(mix2(hash(ix+iy*31+(iz+1)*71), hash(ix+1+iy*31+(iz+1)*71), sx),
         mix2(hash(ix+(iy+1)*31+(iz+1)*71), hash(ix+1+(iy+1)*31+(iz+1)*71), sx), sy),
    sz);
}
function _cpuFbm(x, y, z, octaves = 4) {
  let v = 0, a = 0.5, px = x, py = y, pz = z;
  for (let j = 0; j < octaves; j++) {
    v += a * _cpuNoise3D(px, py, pz);
    px *= 2.2; py *= 2.2; pz *= 2.2;
    px += 73; py += 73; pz += 73;
    a *= 0.48;
  }
  return v;
}

// ---- LOD 配置（v23: 平滑淡出替代硬截断）----
const LOD_LEVELS = [
  { maxDist: 4000,  fraction: 1.0  },  // 近景：全粒子
  { maxDist: 8000,  fraction: 0.65 },  // 中景：65%
  { maxDist: Infinity, fraction: 0.35 }, // 远景：35%
];
// LOD 淡出区间（世界单位）
const LOD_FADE_START = 3500;
const LOD_FADE_END   = 9000;

// JS 版 smoothstep
function _smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class NebulaSystem {
  constructor() {
    this.nebulae = [];
    this.group = new THREE.Group();
    this._insideNebula = null;
    this._hud = null;
  }

  init(scene) {
    const cfg = config.nebula || {};
    const count = cfg.count || 3;
    const types = cfg.types || ['emission', 'reflection', 'dark'];

    for (let i = 0; i < count; i++) {
      const nebType = types[i % types.length];
      const colorCfg = (cfg.typeColors && cfg.typeColors[nebType]) || { r:0.42, g:0.10, b:0.55 };
      const baseColor = new THREE.Color(colorCfg.r, colorCfg.g, colorCfg.b);

      const nebGroup = new THREE.Group();

      // v23: 提前生成统一拉伸轴，传入 CPU 和 Shader 层
      const stretchAxis = new THREE.Vector3(
        (Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2
      ).normalize();
      const stretchAmount = 0.25 + Math.random() * 0.45;

      const layers = this._createLayers(cfg, baseColor, nebType, i, { stretchAxis, stretchAmount });
      layers.forEach(l => nebGroup.add(l.points));

      const spread = (config.stars?.spread || 10000) * 0.4;
      const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
      const r = spread * (0.1+Math.random()*0.8);
      nebGroup.position.set(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta)*0.3, r*Math.cos(phi));

      // v23: 虚拟光源位置（星云内部新恒星照亮气体）
      const scale = cfg.scale || 2000;
      const light1 = new THREE.Vector3(
        (Math.random()-0.5)*scale*0.35, (Math.random()-0.5)*scale*0.25, (Math.random()-0.5)*scale*0.35
      );
      const light2 = new THREE.Vector3(
        (Math.random()-0.5)*scale*0.4, (Math.random()-0.5)*scale*0.3, (Math.random()-0.5)*scale*0.4
      );

      nebGroup.userData = {
        layers, nebType, baseColor,
        scale,
        rotSpeed: 0.08 + Math.random() * 0.22,        // rad/s，配合 delta 使用
        turbulence: 0.25 + Math.random() * 0.4,
        driftDir: new THREE.Vector3((Math.random()-0.5)*0.4,(Math.random()-0.5)*0.1,(Math.random()-0.5)*0.4).normalize(),
        stretchAxis, stretchAmount,                     // v23: 统一拉伸
        lightPos1: light1, lightPos2: light2,
        lightColor1: new THREE.Color().setHSL(0.12 + Math.random()*0.1, 0.6, 0.7 + Math.random()*0.3),
        lightColor2: new THREE.Color().setHSL(0.55 + Math.random()*0.15, 0.5, 0.5 + Math.random()*0.4),
        lightRange1: scale * (0.15 + Math.random()*0.2),
        lightRange2: scale * (0.12 + Math.random()*0.18),
      };
      this.group.add(nebGroup);
      this.nebulae.push(nebGroup);
    }
    scene.add(this.group);
    console.log('[NebulaSystem] v23 深空摄影星云初始化完成，共', count, '团');
  }

  // ==================== 创建多层粒子（v23: 统一 stretchAxis，新增 dustMid） ====================
  _createLayers(cfg, baseColor, nebType, seed, stretchData) {
    const scale = cfg.scale || 2000;
    const { stretchAxis, stretchAmount } = stretchData;
    // v23: 新增 dustMid（外层和中层之间，MultiplyBlending 气体内暗纹）
    //       外层 opacity-30%，中层-25%，内层-22%
    const defs = [
      { name:'dustBg',  count:5000,  spMul:1.1,  opacity:0.50, size:12.0, noiseTh:0.24, turbMul:0.30, isDust:true,  renderOrder:0 },
      { name:'outer',   count:6000,  spMul:1.0,  opacity:0.20, size:8.5,  noiseTh:0.18, turbMul:0.50, isDust:false, renderOrder:1 },
      { name:'dustMid', count:3500,  spMul:0.55, opacity:0.40, size:9.0,  noiseTh:0.22, turbMul:0.35, isDust:true,  renderOrder:2 },
      { name:'mid',     count:8000,  spMul:0.65, opacity:0.42, size:11.0, noiseTh:0.28, turbMul:0.80, isDust:false, renderOrder:3 },
      { name:'inner',   count:4000,  spMul:0.35, opacity:0.58, size:15.0, noiseTh:0.40, turbMul:1.2,  isDust:false, renderOrder:4 },
    ];

    return defs.map((def, li) => {
      const count = def.count, spread = scale * 0.5 * def.spMul;
      const pos = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const rands = new Float32Array(count);

      // v23: CPU 高频噪声过滤 + 统一拉伸轴
      const th = def.noiseTh || 0.25;
      const noiseScale = 1.0 / (spread * 0.13);
      const sax = stretchAxis.x, say = stretchAxis.y, saz = stretchAxis.z;
      let placed = 0;
      const maxAttempts = count * 5;
      for (let attempt = 0; attempt < maxAttempts && placed < count; attempt++) {
        const th2 = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const r2 = spread * (0.05 + Math.random() * 0.95);
        let px = r2 * Math.sin(ph) * Math.cos(th2);
        let py = r2 * Math.sin(ph) * Math.sin(th2);
        let pz = r2 * Math.cos(ph);
        // v23: 统一拉伸轴（所有层共享同一方向）
        const proj = px*sax + py*say + pz*saz;
        px += sax * proj * stretchAmount;
        py += say * proj * stretchAmount;
        pz += saz * proj * stretchAmount;

        const n = _cpuFbm(px * noiseScale, py * noiseScale, pz * noiseScale, 4);
        if (n < th) continue;

        const i3 = placed * 3;
        pos[i3] = px; pos[i3 + 1] = py; pos[i3 + 2] = pz;
        sizes[placed] = def.size * (0.5 + Math.random() * 0.5);
        rands[placed] = n;
        placed++;
      }
      // 填充剩余
      for (let i = placed; i < count; i++) {
        const i3 = i * 3, th2 = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
        const r2 = spread * (0.1 + Math.random() * 0.9);
        pos[i3] = r2 * Math.sin(ph) * Math.cos(th2);
        pos[i3+1] = r2 * Math.sin(ph) * Math.sin(th2);
        pos[i3+2] = r2 * Math.cos(ph);
        sizes[i] = def.size * (0.5 + Math.random() * 0.5);
        rands[i] = Math.random();
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('aRandom', new THREE.BufferAttribute(rands, 1));
      // v23: 存储总粒子数用于 LOD
      geo.userData = { totalCount: count };

      const mat = this._createMaterial(def, baseColor, spread, seed + li, stretchData);
      const pts = new THREE.Points(geo, mat);
      // v23: 视锥剔除 + 宽松包围球 + 软粒子（depthTest=false 避免硬边）
      pts.frustumCulled = true;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), spread * 1.4);
      pts.renderOrder = def.renderOrder || 0;
      // v23: 软粒子效果 — 关闭深度测试，星云始终可见（渲染顺序控制层叠）
      if (!def.isDust) pts.material.depthTest = false;
      return { points: pts, material: mat, config: def, geometry: geo };
    });
  }

  // ==================== Shader 材质（v23: 统一拉伸+纤维+LOD淡出+动态光源） ====================
  _createMaterial(def, baseColor, spread, seed, stretchData) {
    const isDust = def.isDust === true;
    const { stretchAxis, stretchAmount } = stretchData;

    // ---- 尘埃层（MultiplyBlending） ----
    if (isDust) {
      // v23: 背景尘更深灰褐，中层尘略浅带暖
      const isBgDust = def.name === 'dustBg';
      const dustColor = isBgDust
        ? new THREE.Color(0.14, 0.11, 0.08)
        : new THREE.Color(0.22, 0.18, 0.13);
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uDelta: { value: 0.016 },
          uScale: { value: spread * 2 },
          uOpacity: { value: def.opacity },
          uLodFade: { value: 1.0 },
          uColor: { value: dustColor },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          uStretchAxis: { value: stretchAxis.clone() },
          uStretchAmount: { value: stretchAmount },
          uTurbulence: { value: 0.25 },
        },
        vertexShader: `
          attribute float aSize; attribute float aRandom;
          varying float vAlpha; varying float vDensity; varying float vRand;
          uniform float uTime; uniform float uDelta;
          uniform float uScale; uniform float uOpacity; uniform float uLodFade;
          uniform float uPixelRatio;
          uniform vec3 uStretchAxis; uniform float uStretchAmount;
          uniform float uTurbulence;
          ${NOISE_GLSL}
          void main() {
            vec3 pos = position; vRand = aRandom;

            // v23: 统一轴向拉伸
            float proj = dot(pos, uStretchAxis);
            pos += uStretchAxis * proj * uStretchAmount;

            // 平滑FBM湍流
            float t = uTime * 0.025;
            pos.x += fbmSmooth(pos * 0.07 + vec3(t, 0.0, 0.0)) * uScale * 0.006 * uTurbulence;
            pos.y += fbmSmooth(pos * 0.07 + vec3(0.0, t, 0.0) + 51.0) * uScale * 0.006 * uTurbulence;
            pos.z += fbmSmooth(pos * 0.07 + vec3(0.0, 0.0, t) + 103.0) * uScale * 0.006 * uTurbulence;

            float distC = length(position) / (uScale * 0.5);
            float rf = 1.0 - smoothstep(0.05, 1.0, distC);
            rf = pow(rf, 0.7);

            float n = fbm3(position / (uScale * 0.09) + uTime * 0.002);
            vDensity = n;
            // v23: LOD 淡出
            vAlpha = rf * (0.2 + n * 0.8) * uOpacity * uLodFade;

            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = aSize * uPixelRatio * (600.0 / max(-mv.z, 1.0));
            gl_PointSize = clamp(gl_PointSize, 2.0, 40.0);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          precision highp float;
          varying float vAlpha; varying float vDensity; varying float vRand;
          uniform vec3 uColor; uniform float uTime; uniform float uScale;
          ${NOISE_GLSL}
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            // v23: 更柔边缘（软粒子）
            float da = 1.0 - smoothstep(0.0, 1.0, d);
            da = pow(da, 0.75);
            float th = 0.12 + (1.0 - vDensity) * 0.12;
            if (vDensity < th || da < 0.002) discard;
            float a = da * vAlpha;
            a = clamp(a, 0.0, 1.0);
            if (a < 0.0015) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true, depthWrite: false,
        blending: THREE.MultiplyBlending,
        premultipliedAlpha: true,
      });
    }

    // ============ 气体发光层（v23: 纤维噪声+动态光源+5色阶+LOD淡出） ============
    const cCore  = new THREE.Color(0.33, 0.12, 0.58); // 蓝紫核心
    const cInner = new THREE.Color(0.48, 0.18, 0.52); // 品红内层
    const cDust  = new THREE.Color(0.45, 0.33, 0.24); // v23: 灰褐过渡（宇宙尘埃色）
    const cMid   = new THREE.Color(0.52, 0.20, 0.32); // 粉橙中层
    const cEdge  = new THREE.Color(0.18, 0.06, 0.10); // 暗红边缘
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDelta: { value: 0.016 },
        uScale: { value: spread * 2 }, uOpacity: { value: def.opacity },
        uLodFade: { value: 1.0 },
        uColor1: { value: cCore }, uColor2: { value: cInner },
        uColor3: { value: cDust }, uColor4: { value: cMid }, uColor5: { value: cEdge },
        uTurbulence: { value: 0.3 }, uTurbMul: { value: def.turbMul || 1.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uStretchAxis: { value: stretchAxis.clone() },
        uStretchAmount: { value: stretchAmount },
        uLightPos1: { value: new THREE.Vector3(0,0,0) },
        uLightPos2: { value: new THREE.Vector3(0,0,0) },
        uLightColor1: { value: new THREE.Color(1,0.9,0.7) },
        uLightColor2: { value: new THREE.Color(0.7,0.8,1) },
        uLightRange1: { value: 400 }, uLightRange2: { value: 350 },
      },
      vertexShader: `
        attribute float aSize; attribute float aRandom;
        varying float vAlpha; varying float vDensity; varying float vDist;
        varying float vRand; varying vec3 vWPos; varying vec3 vPos;
        varying float vLight1; varying float vLight2;
        uniform float uTime; uniform float uDelta;
        uniform float uScale; uniform float uOpacity; uniform float uLodFade;
        uniform float uPixelRatio;
        uniform float uTurbulence; uniform float uTurbMul;
        uniform vec3 uStretchAxis; uniform float uStretchAmount;
        uniform vec3 uLightPos1; uniform vec3 uLightPos2;
        uniform float uLightRange1; uniform float uLightRange2;
        ${NOISE_GLSL}
        void main() {
          vec3 pos = position; vRand = aRandom; vPos = position;

          // v23: 统一轴向拉伸
          float proj = dot(pos, uStretchAxis);
          pos += uStretchAxis * proj * uStretchAmount;

          // 平滑FBM湍流
          float t = uTime * 0.03 * uTurbMul;
          float turbAmp = uScale * 0.01 * uTurbulence;
          pos.x += fbmSmooth(pos * 0.06 + vec3(t, 0.0, 0.0)) * turbAmp;
          pos.y += fbmSmooth(pos * 0.06 + vec3(0.0, t, 0.0) + 71.0) * turbAmp;
          pos.z += fbmSmooth(pos * 0.06 + vec3(0.0, 0.0, t) + 137.0) * turbAmp;

          float distC = length(position) / (uScale * 0.5);

          // 差速旋转
          float lr = uTime * 0.018 * (1.0 - distC * 0.3);
          float ca = cos(lr), sa = sin(lr);
          float rx = pos.x*ca - pos.z*sa, rz = pos.x*sa + pos.z*ca;
          pos.x = rx; pos.z = rz;

          // 密度：5-octave FBM + 高频
          float n = fbm3(position / (uScale * 0.07) + uTime * 0.0025);
          float hf = noise3D(position / (uScale * 0.025) + uTime * 0.005) * 0.18;
          n = n * 0.82 + hf;
          vDensity = n; vDist = distC;

          // v23: 动态光源 — 漂移+呼吸
          float breathe1 = 1.0 + sin(uTime * 0.65 + vRand * 5.3) * 0.3;
          float breathe2 = 1.0 + cos(uTime * 0.55 + vRand * 4.7) * 0.28;
          float drift = uTime * 0.025;
          vec3 lp1 = uLightPos1 + vec3(sin(drift)*100.0, cos(drift*0.75)*80.0, sin(drift*1.2)*90.0);
          vec3 lp2 = uLightPos2 + vec3(cos(drift*0.8)*85.0, sin(drift*0.65)*75.0, cos(drift*0.9)*95.0);
          float dL1 = length(pos - lp1);
          float dL2 = length(pos - lp2);
          vLight1 = exp(-dL1 * dL1 / (uLightRange1 * uLightRange1)) * breathe1;
          vLight2 = exp(-dL2 * dL2 / (uLightRange2 * uLightRange2)) * breathe2;

          vec4 wp = modelMatrix * vec4(pos, 1.0); vWPos = wp.xyz;

          float rf = 1.0 - smoothstep(0.0, 1.0, distC);
          rf = pow(rf, 0.72);
          // v23: 压暗 + LOD 淡出
          vAlpha = rf * (0.15 + n * 0.85) * uOpacity * uLodFade;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = aSize * uPixelRatio * (680.0 / max(-mv.z, 1.0));
          gl_PointSize = clamp(gl_PointSize, 2.0, 45.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha; varying float vDensity; varying float vDist;
        varying float vRand; varying vec3 vWPos; varying vec3 vPos;
        varying float vLight1; varying float vLight2;
        uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
        uniform vec3 uColor4; uniform vec3 uColor5;
        uniform vec3 uLightColor1; uniform vec3 uLightColor2;
        uniform vec3 uStretchAxis;
        uniform float uTime; uniform float uScale;
        ${NOISE_GLSL}
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          // v23: 超柔光斑（软粒子）
          float da = 1.0 - smoothstep(0.0, 1.0, d);
          da = pow(da, 0.7);

          // v23: 各向异性纤维噪声 — 沿 stretchAxis 拉长丝缕
          float fiberDetail = fiberNoise(vWPos / (uScale * 0.035), normalize(uStretchAxis));
          // 纤维调制密度阈值（纤维区域更可见 → 边缘破碎）
          float fiberEdge = fiberDetail * 0.22;
          float th = 0.08 + vDist * 0.22 - (1.0 - vDensity) * 0.06 - fiberEdge * 0.06;
          if (vDensity < th || da < 0.002) discard;

          // v23: 增强颜色噪声扰动（幅度 +40%）
          float colorNoise = fbm3(vWPos / (uScale * 0.055) + uTime * 0.004 + 17.0);
          float ct = vDist * 0.48 + (1.0 - vDensity) * 0.52;
          ct += (colorNoise - 0.5) * 0.35;
          ct = clamp(ct, 0.0, 1.0);

          // v23: 5色阶渐变 — 核心→品红→灰褐→粉橙→暗红
          vec3 col = mix(uColor1, uColor2, smoothstep(0.06, 0.22, ct));
          col = mix(col, uColor3, smoothstep(0.20, 0.38, ct));  // 灰褐过渡
          col = mix(col, uColor4, smoothstep(0.35, 0.55, ct));
          col = mix(col, uColor5, smoothstep(0.52, 0.88, ct));

          // 亮度扰动
          float brightNoise = fbm3(vWPos / (uScale * 0.035) + 13.0);
          float brightness = 0.52 + brightNoise * 0.48;

          // v23: 动态光源贡献（权重 +50%）
          float lightInfluence = vLight1 * 0.52 + vLight2 * 0.38;
          col += uLightColor1 * vLight1 * 0.28;
          col += uLightColor2 * vLight2 * 0.20;
          brightness += lightInfluence;

          col *= brightness;

          float a = da * vAlpha;
          a = clamp(a, 0.0, 1.0);
          if (a < 0.0012) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  setHUD(hud) { this._hud = hud; }

  // ==================== 更新（v23: LOD 平滑淡出 + 动态光源） ====================
  update(delta, elapsed, camera) {
    if (!camera) return;
    const cfg = config.nebula || {};
    const cm = config.celestialMotion;
    const ms = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;
    const pxr = Math.min(window.devicePixelRatio, 2);
    const dt = Math.min(delta, 0.1);

    let closest = null, closestD = Infinity;
    this.nebulae.forEach((neb, idx) => {
      const d = neb.userData;
      const dist = neb.position.distanceTo(camera.position);
      const ns = d.scale || cfg.scale || 2000;
      if (dist > (cfg.respawnDistance || 10000)) { this._respawn(neb, idx, camera, cfg); return; }
      if (dist < ns * 0.5 && dist < closestD) { closestD = dist; closest = neb; }
      if (d.driftDir) neb.position.addScaledVector(d.driftDir, 0.4 * delta * ms);

      // v23: 宏观自转 × delta（帧率解耦）
      neb.rotation.y += delta * (d.rotSpeed || 0.12) * ms;

      // v23: LOD 分级 + 平滑淡出
      const lod = LOD_LEVELS.find(l => dist < l.maxDist) || LOD_LEVELS[LOD_LEVELS.length-1];
      const lodFade = 1.0 - _smoothstep(LOD_FADE_START, LOD_FADE_END, dist);

      d.layers.forEach(l => {
        if (l.material?.uniforms) {
          l.material.uniforms.uTime.value = elapsed;
          l.material.uniforms.uDelta.value = dt;
          l.material.uniforms.uLodFade.value = lodFade;
          if (l.material.uniforms.uTurbulence) l.material.uniforms.uTurbulence.value = d.turbulence || 0.3;
          l.material.uniforms.uPixelRatio.value = pxr;
          if (l.material.uniforms.uStretchAxis && d.stretchAxis) l.material.uniforms.uStretchAxis.value.copy(d.stretchAxis);
          if (l.material.uniforms.uStretchAmount) l.material.uniforms.uStretchAmount.value = d.stretchAmount || 0.3;
          if (l.material.uniforms.uLightPos1 && d.lightPos1) l.material.uniforms.uLightPos1.value.copy(d.lightPos1);
          if (l.material.uniforms.uLightPos2 && d.lightPos2) l.material.uniforms.uLightPos2.value.copy(d.lightPos2);
          if (l.material.uniforms.uLightColor1 && d.lightColor1) l.material.uniforms.uLightColor1.value.copy(d.lightColor1);
          if (l.material.uniforms.uLightColor2 && d.lightColor2) l.material.uniforms.uLightColor2.value.copy(d.lightColor2);
          if (l.material.uniforms.uLightRange1) l.material.uniforms.uLightRange1.value = d.lightRange1 || 400;
          if (l.material.uniforms.uLightRange2) l.material.uniforms.uLightRange2.value = d.lightRange2 || 350;
        }
        // v23: LOD drawRange（gentler fractions，配合 opacity 淡出）
        if (l.geometry && l.geometry.userData?.totalCount) {
          const total = l.geometry.userData.totalCount;
          const target = Math.max(Math.floor(total * lod.fraction), 150);
          if (l.geometry.drawRange.count !== target) {
            l.geometry.setDrawRange(0, target);
          }
        }
      });
    });

    if (closest && closest !== this._insideNebula) {
      this._insideNebula = closest;
      if (this._hud) { const t = closest.userData.nebType, n = { emission: '发射星云', reflection: '反射星云', dark: '暗星云' }; this._hud.showMessage('已进入 ' + (n[t] || '星云'), 3000); }
    } else if (!closest && this._insideNebula) { this._insideNebula = null; }
  }

  // ==================== 后处理 ====================
  updatePostEffects(uniforms, camera) {
    if (!camera || !this._insideNebula) { uniforms.uFogDensity.value = 0; return; }
    const cfg = config.nebula || {}, d = this._insideNebula.userData;
    const ns = d.scale || cfg.scale || 2000, dist = this._insideNebula.position.distanceTo(camera.position);
    const fd = cfg.fogDistance || 400, md = cfg.fogDensity || 0.5;
    uniforms.uFogDensity.value = Math.max(0, Math.min(md, (1 - dist / (ns * 0.5)) * md));
    const t = d.nebType;
    if (t === 'emission') uniforms.uFogColor.value.set(0.25, 0.08, 0.05);
    else if (t === 'reflection') uniforms.uFogColor.value.set(0.04, 0.08, 0.25);
    else uniforms.uFogColor.value.set(0.02, 0.02, 0.04);
  }

  // ==================== 重生（v23: 重置 LOD） ====================
  _respawn(nebula, index, camera, cfg) {
    const cp = camera.position;
    const cx = Math.round(cp.x / 2000), cy = Math.round(cp.y / 2000), cz = Math.round(cp.z / 2000);
    const rng = seededRandom(hashCoords(cx + index * 7919, cy, cz));
    const th = rng() * Math.PI * 2, ph = Math.acos(2 * rng() - 1);
    const r = (cfg.respawnMin || 2500) + rng() * ((cfg.respawnMax || 7000) - (cfg.respawnMin || 2500));
    const wp = new THREE.Vector3(cp.x + r * Math.sin(ph) * Math.cos(th), cp.y + r * Math.sin(ph) * Math.sin(th) * 0.3, cp.z + r * Math.cos(ph));
    if (nebula.parent) { const im = new THREE.Matrix4().copy(nebula.parent.matrixWorld).invert(); wp.applyMatrix4(im); }
    nebula.position.copy(wp);
    // v23: 重生时重置 LOD 到全量 + 淡出归 1
    nebula.userData.layers.forEach(l => {
      if (l.geometry && l.geometry.userData?.totalCount) {
        l.geometry.setDrawRange(0, l.geometry.userData.totalCount);
      }
      if (l.material?.uniforms?.uLodFade) {
        l.material.uniforms.uLodFade.value = 1.0;
      }
    });
  }

  dispose(scene) {
    scene.remove(this.group);
    this.nebulae.forEach(n => n.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }));
    this.nebulae = [];
  }
}
