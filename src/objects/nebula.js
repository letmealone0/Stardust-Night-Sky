/**
 * NebulaSystem v21 — 深空摄影风格发射星云
 *
 * 改进：
 * - CPU端FBM噪声过滤粒子，源头打破球形
 * - 宏观自转 + 分层湍流
 * - 独立暗尘埃层(MultiplyBlending)，真实吸光遮挡
 * - 高频噪声细节(纤维/空洞/丝缕)
 * - 内层亮度噪声扰动，避免中心过曝
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

// ---- GLSL 噪声 ----
const NOISE_GLSL = `
float hash3D(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3D(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3D(i),hash3D(i+vec3(1,0,0)),f.x),mix(hash3D(i+vec3(0,1,0)),hash3D(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3D(i+vec3(0,0,1)),hash3D(i+vec3(1,0,1)),f.x),mix(hash3D(i+vec3(0,1,1)),hash3D(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p) { float v=0.0,a=0.5; for(int j=0;j<4;j++){v+=a*noise3D(p);p=p*2.1+99.0;a*=0.5;} return v; }
`;

// CPU端 FBM 噪声（用于粒子位置过滤）
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
function _cpuFbm(x, y, z, octaves = 3) {
  let v = 0, a = 0.5, px = x, py = y, pz = z;
  for (let j = 0; j < octaves; j++) {
    v += a * _cpuNoise3D(px, py, pz);
    px *= 2.1; py *= 2.1; pz *= 2.1;
    px += 99; py += 99; pz += 99;
    a *= 0.5;
  }
  return v;
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
      const layers = this._createLayers(cfg, baseColor, nebType, i);
      layers.forEach(l => nebGroup.add(l.points));

      const spread = (config.stars?.spread || 10000) * 0.4;
      const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
      const r = spread * (0.1+Math.random()*0.8);
      nebGroup.position.set(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta)*0.3, r*Math.cos(phi));

      nebGroup.userData = {
        layers, nebType, baseColor,
        scale: cfg.scale || 2000,
        rotSpeed: 0.0004 + Math.random() * 0.0012,
        turbulence: 0.3 + Math.random() * 0.5,
        driftDir: new THREE.Vector3((Math.random()-0.5)*0.4,(Math.random()-0.5)*0.1,(Math.random()-0.5)*0.4).normalize(),
      };
      this.group.add(nebGroup);
      this.nebulae.push(nebGroup);
    }
    scene.add(this.group);
    this._hud = window.engine?.hud || null;
    console.log('[NebulaSystem] v21 深空摄影星云初始化完成，共', count, '团');
  }

  // ==================== 创建多层粒子（v21: CPU FBM过滤） ====================
  _createLayers(cfg, baseColor, nebType, seed) {
    const scale = cfg.scale || 2000;
    const defs = [
      // 气体发光层
      { name:'outer', count:6000,  spMul:1.0,  opacity:0.35, size:5.5,  noiseTh:0.20, turbMul:0.6 },
      { name:'mid',   count:8000,  spMul:0.65, opacity:0.7,  size:8.0,  noiseTh:0.30, turbMul:1.0 },
      { name:'inner', count:4000,  spMul:0.35, opacity:1.0,  size:11.0, noiseTh:0.42, turbMul:1.5 },
      // v21: 暗尘埃层 (MultiplyBlending)
      { name:'dust',  count:3000,  spMul:0.80, opacity:0.45, size:9.0,  noiseTh:0.28, turbMul:0.4, isDust:true },
    ];

    return defs.map((def, li) => {
      const count = def.count, spread = scale * 0.5 * def.spMul;
      const pos = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const rands = new Float32Array(count);

      // v21: CPU FBM 过滤 —— 只在噪声密度高于阈值处放置粒子
      const th = def.noiseTh || 0.25;
      const noiseScale = 1.0 / (spread * 0.18);
      let placed = 0;
      const maxAttempts = count * 4;
      for (let attempt = 0; attempt < maxAttempts && placed < count; attempt++) {
        const th2 = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const r2 = spread * (0.05 + Math.random() * 0.95);
        const px = r2 * Math.sin(ph) * Math.cos(th2);
        const py = r2 * Math.sin(ph) * Math.sin(th2);
        const pz = r2 * Math.cos(ph);
        const n = _cpuFbm(px * noiseScale, py * noiseScale, pz * noiseScale, 3);
        if (n < th) continue; // 低于阈值：丢弃（形成空洞和不规则外形）

        const i3 = placed * 3;
        pos[i3] = px; pos[i3 + 1] = py; pos[i3 + 2] = pz;
        sizes[placed] = def.size * (0.4 + Math.random() * 0.6);
        rands[placed] = n; // 复用为噪声种子
        placed++;
      }
      // 如果没放够，用随机填充补足
      for (let i = placed; i < count; i++) {
        const i3 = i * 3, th2 = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
        const r2 = spread * (0.1 + Math.random() * 0.9);
        pos[i3] = r2 * Math.sin(ph) * Math.cos(th2);
        pos[i3+1] = r2 * Math.sin(ph) * Math.sin(th2);
        pos[i3+2] = r2 * Math.cos(ph);
        sizes[i] = def.size * (0.4 + Math.random() * 0.6);
        rands[i] = Math.random();
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('aRandom', new THREE.BufferAttribute(rands, 1));

      const mat = this._createMaterial(def, baseColor, spread, seed + li);
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      return { points: pts, material: mat, config: def };
    });
  }

  // ==================== Shader 材质 ====================
  _createMaterial(def, baseColor, spread, seed) {
    const isDust = def.isDust === true;

    if (isDust) {
      // v21: 暗尘埃层 — MultiplyBlending 真实吸光
      const dustColor = new THREE.Color(0.18, 0.14, 0.10); // 灰褐
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uScale: { value: spread * 2 },
          uOpacity: { value: def.opacity }, uTurbulence: { value: 0.3 },
          uColor: { value: dustColor }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: `
          attribute float aSize; attribute float aRandom;
          varying float vAlpha; varying float vDensity; varying float vRand;
          uniform float uTime; uniform float uScale; uniform float uTurbulence;
          uniform float uOpacity; uniform float uPixelRatio;
          ${NOISE_GLSL}
          void main() {
            vec3 pos = position; vRand = aRandom;
            float distC = length(position) / (uScale * 0.5);
            float rf = 1.0 - smoothstep(0.1, 1.0, distC);
            float n = fbm3(position / (uScale * 0.12) + uTime * 0.003);
            float turb = uTurbulence * uTime * 0.15;
            pos.x += sin(pos.y*0.1+turb*0.2) * uScale * 0.004;
            pos.y += cos(pos.z*0.1+turb*0.15) * uScale * 0.004;
            pos.z += sin(pos.x*0.1+turb*0.18) * uScale * 0.004;
            vDensity = n;
            vAlpha = rf * (0.15 + n * 0.85) * uOpacity;
            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = aSize * uPixelRatio * (450.0 / max(-mv.z, 1.0));
            gl_PointSize = clamp(gl_PointSize, 1.5, 30.0);
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
            float da = 1.0 - smoothstep(0.0, 1.0, d);
            float th = 0.15 + (1.0 - vDensity) * 0.1;
            if (vDensity < th || da < 0.003) discard;
            float a = da * vAlpha;
            a = clamp(a, 0.0, 1.0);
            if (a < 0.002) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true, depthWrite: false,
        blending: THREE.MultiplyBlending,
      });
    }

    // v21: 气体发光层 — 蓝紫核心/粉紫中层/暗红边缘
    const cCore = new THREE.Color(0.38, 0.10, 0.55);
    const cMid  = new THREE.Color(0.55, 0.16, 0.48);
    const cEdge = new THREE.Color(0.25, 0.07, 0.14);
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uScale: { value: spread * 2 }, uOpacity: { value: def.opacity },
        uColor1: { value: cCore }, uColor2: { value: cMid }, uColor3: { value: cEdge },
        uTurbulence: { value: 0.35 }, uTurbMul: { value: def.turbMul || 1.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aSize; attribute float aRandom;
        varying float vAlpha; varying float vDensity; varying float vDist; varying float vRand; varying vec3 vWPos;
        uniform float uTime; uniform float uScale; uniform float uTurbulence; uniform float uTurbMul;
        uniform float uOpacity; uniform float uPixelRatio;
        ${NOISE_GLSL}
        void main() {
          vec3 pos = position; vRand = aRandom;
          // v21: 增强湍流，分层差异化速度
          float turb = uTurbulence * uTime * uTurbMul;
          pos.x += sin(pos.y*0.18 + turb*0.35) * uScale * 0.012;
          pos.y += cos(pos.z*0.18 + turb*0.3) * uScale * 0.012;
          pos.z += sin(pos.x*0.18 + turb*0.28) * uScale * 0.012;
          float distC = length(position) / (uScale * 0.5);
          // 差速旋转（非刚体）
          float lr = uTime * 0.02 * (1.0 - distC * 0.35);
          float ca = cos(lr), sa = sin(lr);
          float rx = pos.x*ca - pos.z*sa, rz = pos.x*sa + pos.z*ca;
          pos.x = rx; pos.z = rz;
          // v21: 4-octave FBM + 高频细节
          float n = fbm3(position / (uScale * 0.08) + uTime * 0.003);
          // 叠加高频噪声（纤维/空洞细节）
          float hf = noise3D(position / (uScale * 0.03) + uTime * 0.006) * 0.15;
          n = n * 0.85 + hf;
          vDensity = n; vDist = distC;
          vec4 wp = modelMatrix * vec4(pos, 1.0); vWPos = wp.xyz;
          // 径向衰减 — 边缘极柔
          float rf = 1.0 - smoothstep(0.0, 1.0, distC);
          rf = pow(rf, 0.65);
          vAlpha = rf * (0.2 + n * 0.8) * uOpacity;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = aSize * uPixelRatio * (500.0 / max(-mv.z, 1.0));
          gl_PointSize = clamp(gl_PointSize, 1.5, 32.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha; varying float vDensity; varying float vDist; varying float vRand; varying vec3 vWPos;
        uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
        uniform float uTime; uniform float uScale;
        ${NOISE_GLSL}
        void main() {
          // 极柔光斑
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float da = 1.0 - smoothstep(0.0, 1.0, d);
          da = pow(da, 0.55);
          // 密度裁剪 — 噪声决定不规则外形
          float th = 0.10 + vDist * 0.2 - (1.0 - vDensity) * 0.05;
          if (vDensity < th || da < 0.003) discard;
          // v21: 噪声扰动亮度 — 打破中心对称过曝
          float brightNoise = fbm3(vWPos / (uScale * 0.04) + 11.0);
          float brightness = 0.6 + brightNoise * 0.4;
          // 颜色：核心→中层→边缘 三层渐变
          float ct = vDist * 0.55 + (1.0 - vDensity) * 0.45;
          vec3 col = mix(uColor1, uColor2, smoothstep(0.12, 0.45, ct));
          col = mix(col, uColor3, smoothstep(0.4, 0.8, ct));
          // 应用亮度扰动
          col *= brightness;
          float a = da * vAlpha;
          a = clamp(a, 0.0, 1.0);
          if (a < 0.002) discard;
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
    let closest = null, closestD = Infinity;
    this.nebulae.forEach((neb, idx) => {
      const d = neb.userData;
      const dist = neb.position.distanceTo(camera.position);
      const ns = d.scale || cfg.scale || 2000;
      if (dist > (cfg.respawnDistance || 10000)) { this._respawn(neb, idx, camera, cfg); return; }
      if (dist < ns * 0.5 && dist < closestD) { closestD = dist; closest = neb; }
      if (d.driftDir) neb.position.addScaledVector(d.driftDir, 0.4 * delta * ms);
      // v21: 宏观自转
      neb.rotation.y += (d.rotSpeed || 0.0006) * ms;
      d.layers.forEach(l => {
        if (l.material?.uniforms) {
          l.material.uniforms.uTime.value = elapsed;
          if (l.material.uniforms.uTurbulence) l.material.uniforms.uTurbulence.value = d.turbulence || 0.35;
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
  }

  dispose(scene) {
    scene.remove(this.group);
    this.nebulae.forEach(n => n.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }));
    this.nebulae = [];
  }
}
