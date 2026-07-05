/**
 * NebulaSystem v22 — 深空摄影级星云渲染
 *
 * v22 改进：
 * - 宏观自转 × delta 时间解耦帧率
 * - 暗尘埃层 renderOrder=0 先渲染，spMul=1.1 充分遮挡背景
 * - CPU端高频噪声 + 轴向拉伸，彻底打破球形对称
 * - 尘埃 5000 粒子，MultiplyBlending 斑驳遮挡
 * - 4色阶噪声扰动混合，丰富局部色彩变化
 * - 1-2 内部虚拟光源，距离衰减打造立体感
 * - 增大粒子尺寸、降低单粒子透明度，弱化颗粒感
 * - FBM 湍流替代 sin/cos，模拟自然气体流动
 * - 视锥剔除 + LOD 三级分级
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

// ---- GLSL 噪声（v22: 5-octave FBM）----
const NOISE_GLSL = `
float hash3D(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3D(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3D(i),hash3D(i+vec3(1,0,0)),f.x),mix(hash3D(i+vec3(0,1,0)),hash3D(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3D(i+vec3(0,0,1)),hash3D(i+vec3(1,0,1)),f.x),mix(hash3D(i+vec3(0,1,1)),hash3D(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// v22: 5-octave FBM，更丰富的多尺度细节
float fbm3(vec3 p) { float v=0.0,a=0.5; for(int j=0;j<5;j++){v+=a*noise3D(p);p=p*2.2+73.0;a*=0.48;} return v; }
// v22: 低频平滑FBM，专用于湍流位移（避免抖动）
float fbmSmooth(vec3 p) { float v=0.0,a=0.55; for(int j=0;j<3;j++){v+=a*noise3D(p);p=p*2.6+57.0;a*=0.35;} return v; }
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

// ---- LOD 配置 ----
const LOD_LEVELS = [
  { maxDist: 3000,  fraction: 1.0 },   // 近景：全粒子
  { maxDist: 7000,  fraction: 0.55 },  // 中景：55%
  { maxDist: Infinity, fraction: 0.25 }, // 远景：25%
];

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
      const layers = this._createLayers(cfg, baseColor, nebType, i);
      layers.forEach(l => nebGroup.add(l.points));

      const spread = (config.stars?.spread || 10000) * 0.4;
      const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
      const r = spread * (0.1+Math.random()*0.8);
      nebGroup.position.set(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta)*0.3, r*Math.cos(phi));

      // v22: 随机拉伸轴（打破球形对称）
      const stretchAxis = new THREE.Vector3(
        (Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2
      ).normalize();

      // v22: 虚拟光源位置（星云内部新恒星照亮气体）
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
        rotSpeed: 0.08 + Math.random() * 0.22,        // v22: rad/s，配合 delta 使用
        turbulence: 0.25 + Math.random() * 0.4,
        driftDir: new THREE.Vector3((Math.random()-0.5)*0.4,(Math.random()-0.5)*0.1,(Math.random()-0.5)*0.4).normalize(),
        stretchAxis,
        stretchAmount: 0.25 + Math.random() * 0.45,
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
    this._hud = window.engine?.hud || null;
    console.log('[NebulaSystem] v22 深空摄影星云初始化完成，共', count, '团');
  }

  // ==================== 创建多层粒子 ====================
  _createLayers(cfg, baseColor, nebType, seed) {
    const scale = cfg.scale || 2000;
    // v22: dust 放到第一位（renderOrder=0 先渲染），spMul 1.1，5000粒子
    const defs = [
      // 暗尘埃层 — 最先渲染，遮挡背景
      { name:'dust',  count:5000,  spMul:1.1,  opacity:0.55, size:12.0, noiseTh:0.26, turbMul:0.35, isDust:true,  renderOrder:0 },
      // 气体发光层
      { name:'outer', count:6000,  spMul:1.0,  opacity:0.28, size:8.0,  noiseTh:0.18, turbMul:0.55, isDust:false, renderOrder:1 },
      { name:'mid',   count:8000,  spMul:0.65, opacity:0.55, size:11.0, noiseTh:0.28, turbMul:0.85, isDust:false, renderOrder:2 },
      { name:'inner', count:4000,  spMul:0.35, opacity:0.75, size:15.0, noiseTh:0.40, turbMul:1.3,  isDust:false, renderOrder:3 },
    ];

    return defs.map((def, li) => {
      const count = def.count, spread = scale * 0.5 * def.spMul;
      const pos = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const rands = new Float32Array(count);

      // v22: CPU 高频噪声过滤（频率提高 1.4×，更不规则）
      const th = def.noiseTh || 0.25;
      const noiseScale = 1.0 / (spread * 0.13); // v21: 0.18 → v22: 0.13（更高频）
      let placed = 0;
      const maxAttempts = count * 5;
      for (let attempt = 0; attempt < maxAttempts && placed < count; attempt++) {
        const th2 = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const r2 = spread * (0.05 + Math.random() * 0.95);
        let px = r2 * Math.sin(ph) * Math.cos(th2);
        let py = r2 * Math.sin(ph) * Math.sin(th2);
        let pz = r2 * Math.cos(ph);
        // v22: 轴向拉伸 — 沿拉伸轴拉长坐标
        const ax = (seed * 0.37 + li * 0.13) % 1;
        const stretchAxis = {
          x: Math.sin(ax * 6.28), y: Math.cos(ax * 5.12), z: Math.sin(ax * 4.37 + 1.5)
        };
        const stretchMag = Math.sqrt(stretchAxis.x*stretchAxis.x+stretchAxis.y*stretchAxis.y+stretchAxis.z*stretchAxis.z);
        const sx = stretchAxis.x/stretchMag, sy = stretchAxis.y/stretchMag, sz = stretchAxis.z/stretchMag;
        const proj = px*sx + py*sy + pz*sz;
        const stretchAmt = 0.3; // CPU端预拉伸
        px += sx * proj * stretchAmt;
        py += sy * proj * stretchAmt;
        pz += sz * proj * stretchAmt;

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
      // v22: 存储总粒子数用于 LOD
      geo.userData = { totalCount: count };

      const mat = this._createMaterial(def, baseColor, spread, seed + li);
      const pts = new THREE.Points(geo, mat);
      // v22: 视锥剔除 + 宽松包围球
      pts.frustumCulled = true;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), spread * 1.3);
      pts.renderOrder = def.renderOrder || 0;
      return { points: pts, material: mat, config: def, geometry: geo };
    });
  }

  // ==================== Shader 材质 ====================
  _createMaterial(def, baseColor, spread, seed) {
    const isDust = def.isDust === true;

    if (isDust) {
      // v22: 暗尘埃层 — MultiplyBlending，renderOrder 0 先渲染遮挡背景
      const dustColor = new THREE.Color(0.16, 0.12, 0.09); // 更深灰褐
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uDelta: { value: 0.016 },
          uScale: { value: spread * 2 },
          uOpacity: { value: def.opacity },
          uColor: { value: dustColor },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          uStretchAxis: { value: new THREE.Vector3(0,1,0) },
          uStretchAmount: { value: 0.3 },
          uTurbulence: { value: 0.25 },
        },
        vertexShader: `
          attribute float aSize; attribute float aRandom;
          varying float vAlpha; varying float vDensity; varying float vRand;
          uniform float uTime; uniform float uDelta;
          uniform float uScale; uniform float uOpacity; uniform float uPixelRatio;
          uniform vec3 uStretchAxis; uniform float uStretchAmount;
          uniform float uTurbulence;
          ${NOISE_GLSL}
          void main() {
            vec3 pos = position; vRand = aRandom;

            // v22: 轴向拉伸（着色器端叠加）
            float proj = dot(pos, uStretchAxis);
            pos += uStretchAxis * proj * uStretchAmount;

            // v22: 平滑FBM湍流（替代sin/cos，减少抖动）
            float t = uTime * 0.025;
            pos.x += fbmSmooth(pos * 0.07 + vec3(t, 0.0, 0.0)) * uScale * 0.006 * uTurbulence;
            pos.y += fbmSmooth(pos * 0.07 + vec3(0.0, t, 0.0) + 51.0) * uScale * 0.006 * uTurbulence;
            pos.z += fbmSmooth(pos * 0.07 + vec3(0.0, 0.0, t) + 103.0) * uScale * 0.006 * uTurbulence;

            float distC = length(position) / (uScale * 0.5);
            float rf = 1.0 - smoothstep(0.05, 1.0, distC);
            rf = pow(rf, 0.7);

            // 尘埃密度：斑驳不均匀
            float n = fbm3(position / (uScale * 0.09) + uTime * 0.002);
            vDensity = n;
            // v22: 提高不透明度让遮挡更明显
            vAlpha = rf * (0.2 + n * 0.8) * uOpacity;

            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            // v22: 更大粒子
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
            // v22: 更柔和的边缘（大粒子弱化颗粒感）
            float da = 1.0 - smoothstep(0.0, 1.0, d);
            da = pow(da, 0.7);
            // 斑驳裁剪
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
      });
    }

    // ============ 气体发光层 ============
    // v22: 4色阶 + 虚拟光源 + 轴向拉伸 + FBM湍流
    const cCore  = new THREE.Color(0.35, 0.12, 0.58); // 蓝紫核心
    const cInner = new THREE.Color(0.50, 0.18, 0.52); // 品红内层
    const cMid   = new THREE.Color(0.55, 0.22, 0.35); // 粉橙中层
    const cEdge  = new THREE.Color(0.20, 0.06, 0.12); // 暗红边缘
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDelta: { value: 0.016 },
        uScale: { value: spread * 2 }, uOpacity: { value: def.opacity },
        uColor1: { value: cCore }, uColor2: { value: cInner },
        uColor3: { value: cMid }, uColor4: { value: cEdge },
        uTurbulence: { value: 0.3 }, uTurbMul: { value: def.turbMul || 1.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        // v22: 轴向拉伸
        uStretchAxis: { value: new THREE.Vector3(0,1,0) },
        uStretchAmount: { value: 0.35 },
        // v22: 虚拟光源
        uLightPos1: { value: new THREE.Vector3(0,0,0) },
        uLightPos2: { value: new THREE.Vector3(0,0,0) },
        uLightColor1: { value: new THREE.Color(1,0.9,0.7) },
        uLightColor2: { value: new THREE.Color(0.7,0.8,1) },
        uLightRange1: { value: 400 }, uLightRange2: { value: 350 },
      },
      vertexShader: `
        attribute float aSize; attribute float aRandom;
        varying float vAlpha; varying float vDensity; varying float vDist;
        varying float vRand; varying vec3 vWPos;
        varying float vLight1; varying float vLight2;
        uniform float uTime; uniform float uDelta;
        uniform float uScale; uniform float uOpacity; uniform float uPixelRatio;
        uniform float uTurbulence; uniform float uTurbMul;
        uniform vec3 uStretchAxis; uniform float uStretchAmount;
        uniform vec3 uLightPos1; uniform vec3 uLightPos2;
        uniform float uLightRange1; uniform float uLightRange2;
        ${NOISE_GLSL}
        void main() {
          vec3 pos = position; vRand = aRandom;

          // v22: 轴向拉伸
          float proj = dot(pos, uStretchAxis);
          pos += uStretchAxis * proj * uStretchAmount;

          // v22: 平滑FBM湍流（替代抖动sin/cos）
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

          // 密度：5-octave FBM + 高频细节
          float n = fbm3(position / (uScale * 0.07) + uTime * 0.0025);
          float hf = noise3D(position / (uScale * 0.025) + uTime * 0.005) * 0.18;
          n = n * 0.82 + hf;
          vDensity = n; vDist = distC;

          // v22: 虚拟光源距离衰减
          float dL1 = length(pos - uLightPos1);
          float dL2 = length(pos - uLightPos2);
          vLight1 = exp(-dL1 * dL1 / (uLightRange1 * uLightRange1));
          vLight2 = exp(-dL2 * dL2 / (uLightRange2 * uLightRange2));

          vec4 wp = modelMatrix * vec4(pos, 1.0); vWPos = wp.xyz;

          float rf = 1.0 - smoothstep(0.0, 1.0, distC);
          rf = pow(rf, 0.7);
          // v22: 降低基础透明度（大粒子补偿）
          vAlpha = rf * (0.15 + n * 0.85) * uOpacity;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          // v22: 增大粒子尺寸（×1.4）
          gl_PointSize = aSize * uPixelRatio * (680.0 / max(-mv.z, 1.0));
          gl_PointSize = clamp(gl_PointSize, 2.0, 45.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha; varying float vDensity; varying float vDist;
        varying float vRand; varying vec3 vWPos;
        varying float vLight1; varying float vLight2;
        uniform vec3 uColor1; uniform vec3 uColor2;
        uniform vec3 uColor3; uniform vec3 uColor4;
        uniform vec3 uLightColor1; uniform vec3 uLightColor2;
        uniform float uTime; uniform float uScale;
        ${NOISE_GLSL}
        void main() {
          // v22: 更柔光斑（大粒子弱化颗粒感）
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float da = 1.0 - smoothstep(0.0, 1.0, d);
          da = pow(da, 0.65);

          float th = 0.08 + vDist * 0.22 - (1.0 - vDensity) * 0.06;
          if (vDensity < th || da < 0.002) discard;

          // v22: 噪声扰动颜色混合（丰富局部色彩变化）
          float colorNoise = fbm3(vWPos / (uScale * 0.06) + uTime * 0.004 + 17.0);
          float ct = vDist * 0.5 + (1.0 - vDensity) * 0.5;
          // 噪声偏移混合参数
          ct += (colorNoise - 0.5) * 0.25;
          ct = clamp(ct, 0.0, 1.0);

          // 4色阶渐变：核心→内层→中层→边缘
          vec3 col = mix(uColor1, uColor2, smoothstep(0.08, 0.30, ct));
          col = mix(col, uColor3, smoothstep(0.28, 0.55, ct));
          col = mix(col, uColor4, smoothstep(0.50, 0.85, ct));

          // v22: 亮度扰动
          float brightNoise = fbm3(vWPos / (uScale * 0.035) + 13.0);
          float brightness = 0.55 + brightNoise * 0.45;

          // v22: 虚拟光源贡献（立体感）
          float lightInfluence = vLight1 * 0.35 + vLight2 * 0.25;
          col += uLightColor1 * vLight1 * 0.2;
          col += uLightColor2 * vLight2 * 0.15;
          brightness += lightInfluence;

          col *= brightness;

          float a = da * vAlpha;
          a = clamp(a, 0.0, 1.0);
          if (a < 0.0015) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  // ==================== 更新 ====================
  update(delta, elapsed, camera) {
    if (!camera) return;
    const cfg = config.nebula || {};
    const cm = config.celestialMotion;
    const ms = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;
    const pxr = Math.min(window.devicePixelRatio, 2);

    let closest = null, closestD = Infinity;
    this.nebulae.forEach((neb, idx) => {
      const d = neb.userData;
      const dist = neb.position.distanceTo(camera.position);
      const ns = d.scale || cfg.scale || 2000;
      if (dist > (cfg.respawnDistance || 10000)) { this._respawn(neb, idx, camera, cfg); return; }
      if (dist < ns * 0.5 && dist < closestD) { closestD = dist; closest = neb; }
      if (d.driftDir) neb.position.addScaledVector(d.driftDir, 0.4 * delta * ms);

      // v22: 宏观自转 × delta（帧率解耦）
      neb.rotation.y += delta * (d.rotSpeed || 0.12) * ms;

      // v22: LOD 分级
      const lod = LOD_LEVELS.find(l => dist < l.maxDist) || LOD_LEVELS[LOD_LEVELS.length-1];

      d.layers.forEach(l => {
        if (l.material?.uniforms) {
          l.material.uniforms.uTime.value = elapsed;
          l.material.uniforms.uDelta.value = Math.min(delta, 0.1);
          if (l.material.uniforms.uTurbulence) l.material.uniforms.uTurbulence.value = d.turbulence || 0.3;
          l.material.uniforms.uPixelRatio.value = pxr;
          // v22: 传递拉伸参数
          if (l.material.uniforms.uStretchAxis && d.stretchAxis) l.material.uniforms.uStretchAxis.value.copy(d.stretchAxis);
          if (l.material.uniforms.uStretchAmount) l.material.uniforms.uStretchAmount.value = d.stretchAmount || 0.3;
          // v22: 传递虚拟光源参数
          if (l.material.uniforms.uLightPos1 && d.lightPos1) l.material.uniforms.uLightPos1.value.copy(d.lightPos1);
          if (l.material.uniforms.uLightPos2 && d.lightPos2) l.material.uniforms.uLightPos2.value.copy(d.lightPos2);
          if (l.material.uniforms.uLightColor1 && d.lightColor1) l.material.uniforms.uLightColor1.value.copy(d.lightColor1);
          if (l.material.uniforms.uLightColor2 && d.lightColor2) l.material.uniforms.uLightColor2.value.copy(d.lightColor2);
          if (l.material.uniforms.uLightRange1) l.material.uniforms.uLightRange1.value = d.lightRange1 || 400;
          if (l.material.uniforms.uLightRange2) l.material.uniforms.uLightRange2.value = d.lightRange2 || 350;
        }
        // v22: LOD drawRange 调整
        if (l.geometry && l.geometry.userData?.totalCount) {
          const total = l.geometry.userData.totalCount;
          const target = Math.max(Math.floor(total * lod.fraction), 100);
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

  // ==================== 重生 ====================
  _respawn(nebula, index, camera, cfg) {
    const cp = camera.position;
    const cx = Math.round(cp.x / 2000), cy = Math.round(cp.y / 2000), cz = Math.round(cp.z / 2000);
    const rng = seededRandom(hashCoords(cx + index * 7919, cy, cz));
    const th = rng() * Math.PI * 2, ph = Math.acos(2 * rng() - 1);
    const r = (cfg.respawnMin || 2500) + rng() * ((cfg.respawnMax || 7000) - (cfg.respawnMin || 2500));
    const wp = new THREE.Vector3(cp.x + r * Math.sin(ph) * Math.cos(th), cp.y + r * Math.sin(ph) * Math.sin(th) * 0.3, cp.z + r * Math.cos(ph));
    if (nebula.parent) { const im = new THREE.Matrix4().copy(nebula.parent.matrixWorld).invert(); wp.applyMatrix4(im); }
    nebula.position.copy(wp);
    // v22: 重生时重置 LOD
    nebula.userData.layers.forEach(l => {
      if (l.geometry && l.geometry.userData?.totalCount) {
        l.geometry.setDrawRange(0, l.geometry.userData.totalCount);
      }
    });
  }

  dispose(scene) {
    scene.remove(this.group);
    this.nebulae.forEach(n => n.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }));
    this.nebulae = [];
  }
}
