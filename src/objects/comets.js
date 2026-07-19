/**
 * 彗星系统 v6.0 — 电影级重构：双尾分离（弯曲尘埃尾+笔直离子尾）与流体蓬松彗发
 *
 * v6.0 改进:
 * - 彗发消除"蝌蚪尖": 尾部喇叭口微张 + 高阶溶解至透明
 * - 双尾曲率彻底分离: 尘埃尾 curve=0.00085, 离子尾 curve=0.0
 * - 尘埃尾暖金白色调 + 更大扇形展宽
 * - 离子尾电光蓝 + 细密等离子丝缕
 * - 保留 delta 累加轨道、LOD 淡出、parent.remove dispose
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

const COMET_DATA = [
  {
    id: 'halley', name: '1P/Halley', nameCN: '哈雷彗星',
    lastPerihelionMs: Date.UTC(1986, 1, 9),
    a: 6200, e: 0.967, i: 162, ω: 111, periodDays: 27759,
    nucleusRadius: 1.8, comaRadius: 18,
    dustLen: 500, dustHalfW: 16.0, ionLen: 650, ionHalfW: 5.0,
    dustInner: [0.96, 0.86, 0.72],
    dustOuter: [0.65, 0.55, 0.48],
    ionColor:  [0.05, 0.62, 1.0],
    perihelion: 204.6,
  },
  {
    id: 'halebopp', name: 'C/1995 O1', nameCN: '海尔-波普彗星',
    lastPerihelionMs: Date.UTC(1997, 3, 1),
    a: 8000, e: 0.975, i: 89, ω: 130, periodDays: 912500,
    nucleusRadius: 2.5, comaRadius: 30,
    dustLen: 800, dustHalfW: 24.0, ionLen: 950, ionHalfW: 6.0,
    dustInner: [0.98, 0.88, 0.75],
    dustOuter: [0.68, 0.58, 0.50],
    ionColor:  [0.04, 0.65, 1.0],
    perihelion: 200.0,
  },
  {
    id: 'encke', name: '2P/Encke', nameCN: '恩克彗星',
    lastPerihelionMs: Date.UTC(2023, 9, 22),
    a: 2800, e: 0.848, i: 12, ω: 186, periodDays: 1205,
    nucleusRadius: 1.3, comaRadius: 10,
    dustLen: 300, dustHalfW: 9.0, ionLen: 420, ionHalfW: 3.5,
    dustInner: [0.95, 0.84, 0.70],
    dustOuter: [0.62, 0.52, 0.45],
    ionColor:  [0.06, 0.60, 1.0],
    perihelion: 228.0,
  },
  {
    id: 'swifttuttle', name: '109P/Swift-Tuttle', nameCN: '斯威夫特-塔特尔彗星',
    lastPerihelionMs: Date.UTC(1992, 11, 11),
    a: 5500, e: 0.963, i: 113, ω: 153, periodDays: 48545,
    nucleusRadius: 2.0, comaRadius: 22,
    dustLen: 600, dustHalfW: 18.0, ionLen: 750, ionHalfW: 5.0,
    dustInner: [0.96, 0.85, 0.72],
    dustOuter: [0.65, 0.55, 0.48],
    ionColor:  [0.05, 0.62, 1.0],
    perihelion: 203.5,
  },
];

const _cfg = config.comets || {};
const ORBIT_TIME_SCALE = _cfg.orbitTimeScale ?? 1.0;
const ORBIT_PERIOD_COMPRESS = _cfg.orbitPeriodCompress ?? (1 / 3);
const ORBIT_BASE_SECONDS = _cfg.orbitBaseSeconds ?? 90;
const MAX_PERIOD_DAYS = Math.max(...COMET_DATA.map((d) => d.periodDays));
const LOD_FAR = 45000;
const LOD_VERY_FAR = 100000;
const LOD_FADE_START = 25000;
const CLOSE_PARTICLE_DIST = 300;
const DUST_FLOW = 0.8;
const ION_FLOW = 2.2;

const GLOBAL_BREATH_SPEED = _cfg.globalBreathSpeed ?? 0.55;
const BURST_INTERVAL = _cfg.burstInterval ?? 5.0;
const COMA_NOISE_SPEED = _cfg.comaNoiseSpeed ?? 0.25;
const TAIL_WAVE_AMP = _cfg.tailWaveAmplitude ?? 1.0;
const RAINBOW_INTENSITY = _cfg.rainbowIntensity ?? 1.0;
const GLOW_INTENSITY = _cfg.glowIntensity ?? 1.0;

const NOISE_3D_GLSL = `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm4(vec3 p) {
    float v = 0.0, a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.2 + shift;
      a *= 0.45;
    }
    return v;
  }
`;

const RAINBOW_GLSL = `
  vec3 rainbowShift(float t) {
    float hue = 0.48 + t * 0.18;
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, 1.5);
    return col;
  }
`;

export class CometSystem {
  constructor() {
    this.group = new THREE.Group();
    this.comets = [];
    this._camera = null;
    this._tailQ = new THREE.Quaternion();
    this._tailFrom = new THREE.Vector3(0, 0, 1);
    this._tailTo = new THREE.Vector3();
    this._tmpWorld = new THREE.Vector3();
    this._orbitPos = new THREE.Vector3();
    this._burstTimers = [];
    this._glowIntensity = GLOW_INTENSITY;
    this._rainbowIntensity = RAINBOW_INTENSITY;
    this._tailWaveAmp = TAIL_WAVE_AMP;
  }

  setCamera(camera) { this._camera = camera; }

  init(solarSystemGroup) {
    COMET_DATA.forEach((data) => {
      this._createComet(data);
      this._burstTimers.push(Math.random() * BURST_INTERVAL);
    });
    solarSystemGroup.add(this.group);
    console.log('[Comets] v6.0 重构完成 — 暖金弯曲尘埃尾 + 电蓝笔直离子尾 + 蓬松彗发');
  }

  _createComet(data) {
    const comet = { data, tailMeshes: [] };
    comet.group = new THREE.Group();
    comet.group.name = data.name;
    comet.tailGroup = new THREE.Group();

    comet.nucleus = this._createNucleus(data);
    comet.group.add(comet.nucleus);

    comet.closeParticles = this._createCloseParticles(data);
    comet.tailGroup.add(comet.closeParticles);

    comet.coma = this._createComa(data);
    comet.group.add(comet.coma);

    // ==== 双尾分离 ====
    // 尘埃尾：显著弯曲度 + 暖金/黄白色调
    const dustCurve = 0.00085;
    this._addTailPair(comet, data.dustLen, data.dustHalfW, 64,
      data.dustInner, 0.50, dustCurve, DUST_FLOW, true);
    this._addTailPair(comet, data.dustLen * 0.85, data.dustHalfW * 1.5, 48,
      data.dustOuter, 0.30, dustCurve * 0.9, DUST_FLOW, true);

    // 离子尾：完全笔直（太阳风直接推向后方）+ 电光蓝
    this._addTailPair(comet, data.ionLen * 1.3, data.ionHalfW, 44,
      data.ionColor, 0.45, 0.0, ION_FLOW, false);

    comet.group.add(comet.tailGroup);

    const nowMs = Date.now();
    const elapsedDays = (nowMs - data.lastPerihelionMs) / 86400000;
    const frac = (elapsedDays % data.periodDays) / data.periodDays;
    comet.M0 = frac * Math.PI * 2;

    const visualPeriodSeconds =
      (ORBIT_BASE_SECONDS / ORBIT_TIME_SCALE) *
      Math.pow(data.periodDays / MAX_PERIOD_DAYS, ORBIT_PERIOD_COMPRESS);
    comet.meanMotion = (Math.PI * 2) / visualPeriodSeconds;

    this.group.add(comet.group);
    this.comets.push(comet);
  }

  _addTailPair(comet, length, halfW, segs, color, alpha, curve, flowSpeed, enableRainbow) {
    const main = this._createTailRibbon(length, halfW, segs, color, alpha, curve, flowSpeed, enableRainbow);
    const cross = this._createTailRibbon(length, halfW, segs, color, alpha * 0.60, curve, flowSpeed, enableRainbow);
    cross.rotation.z = Math.PI / 2;
    comet.tailGroup.add(main);
    comet.tailGroup.add(cross);
    comet.tailMeshes.push(main, cross);
  }

  _createNucleus(data) {
    const geo = new THREE.SphereGeometry(data.nucleusRadius, 14, 14);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.95, 0.85, 0.70),
    });
    const mesh = new THREE.Mesh(geo, mat);
    const gi = this._glowIntensity;

    const glowGeo = new THREE.SphereGeometry(data.nucleusRadius * 3.5, 14, 14);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uActivity: { value: 1.0 },
        uGlobalBreath: { value: 1.0 }, uBurst: { value: 1.0 },
        uLodFade: { value: 1.0 },
      },
      vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main(){vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;vL=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `precision highp float;varying vec3 vN;varying vec3 vW;varying vec3 vL;
        uniform float uTime;uniform float uActivity;uniform float uGlobalBreath;uniform float uBurst;uniform float uLodFade;
        void main(){
          vec3 vd=normalize(cameraPosition-vW);float r=length(vL);float nr=r/3.5;
          float d=exp(-nr*nr*4.5);float rim=1.0-abs(dot(normalize(vN),vd));float rg=pow(rim,2.2)*0.5;
          float br=0.78+0.22*uGlobalBreath;float bu=1.0+(uBurst-1.0)*0.5;
          float alpha=(d*0.4+rg)*uActivity*br*bu*${gi.toFixed(2)};alpha=clamp(alpha,0.0,0.8);if(alpha<0.003)discard;
          float mt=nr;vec3 ic=vec3(0.95,0.78,0.55);vec3 oc=vec3(0.12,0.55,0.92);
          vec3 col=mix(ic,oc,mt);vec3 rc=mix(vec3(0.95,0.45,0.22),vec3(0.15,0.55,0.88),rim);
          col=mix(col,rc,rg*2.5);gl_FragColor=vec4(col*(1.0+rg*0.8)*br*bu,alpha*uLodFade);
        }`,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      transparent: true, depthWrite: false,
    });
    mesh.add(new THREE.Mesh(glowGeo, glowMat));
    return mesh;
  }

  // ==================== 彗发：流线蓬松大角度气体过渡（消除蝌蚪尖） ====================
  _createComa(data) {
    const geo = new THREE.SphereGeometry(data.comaRadius, 32, 32);
    const colorArr = data.dustInner;
    const gi = this._glowIntensity;
    const cr = data.comaRadius.toFixed(1);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(colorArr[0], colorArr[1], colorArr[2]) },
        uActivity: { value: 1.0 }, uTime: { value: 0 },
        uGlobalBreath: { value: 1.0 }, uBurst: { value: 1.0 },
        uLodFade: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main() {
          vec3 pos = position;
          // 头部(-Z)迎风微压缩，尾部(+Z)接近球形 → 消除胶囊感
          if (pos.z > 0.0) {
            pos.z *= 1.1;
            pos.xy *= (1.0 + pos.z * 0.012);
          } else {
            pos.z *= 0.75;
          }
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vW = wp.xyz;
          vL = pos;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vN; varying vec3 vW; varying vec3 vL;
        uniform vec3 uColor; uniform float uActivity; uniform float uTime;
        uniform float uGlobalBreath; uniform float uBurst; uniform float uLodFade;
        ${NOISE_3D_GLSL}
        void main(){
          vec3 vd=normalize(cameraPosition-vW);
          float r=length(vL);float nr=r/${cr};
          float density=exp(-nr*nr*2.5);
          vec3 np=vL*0.12+uTime*${(COMA_NOISE_SPEED * 1.2).toFixed(2)};
          float noiseVal=fbm4(np);
          density*=(1.0+(noiseVal-0.4)*0.45);
          // 尾部高阶溶解：气体浓度自然向+Z方向消融至零
          float tailFade = 1.0;
          if (vL.z > 0.0) {
            tailFade = clamp(1.0 - (vL.z / (1.1 * ${cr})), 0.0, 1.0);
            tailFade = pow(tailFade, 2.5);
          }
          density *= tailFade;
          float sunFace=smoothstep(-0.40,0.50,-vL.z/${cr});
          float sunPulse=1.0+sin(uTime*1.8+sunFace*5.0)*0.12;
          float sunBoost=(1.0+sunFace*0.62)*sunPulse;
          float rim=1.0-abs(dot(normalize(vN),vd));
          float rimAlpha=pow(rim,2.5)*0.45;
          vec3 rimCol1=vec3(0.92,0.48,0.12);
          vec3 rimCol2=vec3(0.10,0.52,0.92);
          vec3 rimCol=mix(rimCol1,rimCol2,rim*2.5);
          float breath=0.75+0.25*uGlobalBreath;
          float burst=1.0+(uBurst-1.0)*uActivity*1.2;
          float alpha=(density*0.65+rimAlpha*0.35)*sunBoost*uActivity*breath*burst*${gi.toFixed(2)};
          alpha=clamp(alpha,0.0,0.95);
          if(alpha<0.003)discard;
          float cm=nr*0.75+noiseVal*0.25;
          vec3 innerCol=uColor*1.3;
          vec3 outerCol=vec3(0.85,0.60,0.30);
          vec3 col=mix(innerCol,outerCol,clamp(cm,0.0,1.0));
          col=mix(col,rimCol,rimAlpha*2.0);
          col*=((1.0+rimAlpha*0.4)*(0.85+0.15*breath)*burst*${gi.toFixed(2)});
          gl_FragColor=vec4(col,alpha*uLodFade);
        }`,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.material = mat;
    return mesh;
  }

  // ==================== 彗尾：指数扇面大展宽与横向气体丝缕 ====================
  _createTailRibbon(length, halfWidth, segments, colorArr, maxAlpha, curvature, flowSpeed, enableRainbow) {
    const vertCount = (segments + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const RGBA = new Float32Array(vertCount * 4);
    const normXs = new Float32Array(vertCount);
    const indices = [];
    const [cr, cg, cb] = colorArr;
    const gi = this._glowIntensity;
    const ri = this._rainbowIntensity;
    const twa = this._tailWaveAmp;
    const lengthStr = length.toFixed(1);
    const isIon = !enableRainbow;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -t * length;

      let w;
      if (isIon) {
        w = halfWidth * (0.15 + t * 0.85);                   // 离子尾：紧凑笔直
      } else {
        w = halfWidth * (0.15 + Math.pow(t, 1.3) * 15.0);    // 尘埃尾：更大扇形展开
      }

      const curveX = curvature * z * z;
      const tailAlpha = maxAlpha * Math.pow(Math.max(1.0 - t, 0.001), isIon ? 1.5 : 2.6);

      const li = i * 2;
      positions[li * 3] = -w + curveX;
      positions[li * 3 + 1] = 0;
      positions[li * 3 + 2] = z;
      RGBA[li * 4] = cr; RGBA[li * 4 + 1] = cg; RGBA[li * 4 + 2] = cb;
      RGBA[li * 4 + 3] = tailAlpha;
      normXs[li] = -1.0;

      const ri_pos = i * 2 + 1;
      positions[ri_pos * 3] = w + curveX;
      positions[ri_pos * 3 + 1] = 0;
      positions[ri_pos * 3 + 2] = z;
      RGBA[ri_pos * 4] = cr; RGBA[ri_pos * 4 + 1] = cg; RGBA[ri_pos * 4 + 2] = cb;
      RGBA[ri_pos * 4 + 3] = tailAlpha;
      normXs[ri_pos] = 1.0;

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRGBA', new THREE.BufferAttribute(RGBA, 4));
    geo.setAttribute('aNormX', new THREE.BufferAttribute(normXs, 1));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHalfWidth: { value: halfWidth }, uActivity: { value: 1.0 },
        uTime: { value: 0 }, uFlowSpeed: { value: flowSpeed || 1.0 },
        uGlobalBreath: { value: 1.0 }, uBurst: { value: 1.0 },
        uLodFade: { value: 1.0 },
      },
      vertexShader: `
        attribute vec4 aRGBA; attribute float aNormX;
        varying vec4 vColor; varying float vNormX; varying float vLocalZ; varying float vLocalT;
        uniform float uTime; uniform float uActivity; uniform float uHalfWidth;
        void main() {
          vec3 pos = position;
          float amp = ${twa.toFixed(2)};
          float tNorm = clamp(-pos.z / ${lengthStr}, 0.0, 1.0);
          float waveX = sin(pos.z * 0.001 - uTime * 1.5) * uHalfWidth * 0.28 * amp * tNorm;
          float waveY = cos(pos.z * 0.0008 + uTime * 1.2) * uHalfWidth * 0.15 * amp * tNorm;
          pos.x += waveX;
          pos.y += waveY;
          vColor = aRGBA; vNormX = aNormX; vLocalZ = pos.z; vLocalT = tNorm;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vColor; varying float vNormX; varying float vLocalZ; varying float vLocalT;
        uniform float uHalfWidth; uniform float uActivity; uniform float uTime;
        uniform float uFlowSpeed; uniform float uGlobalBreath; uniform float uBurst;
        uniform float uLodFade;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        ${RAINBOW_GLSL}

        void main() {
          float edgeFade = exp(-vNormX * vNormX * 2.8);
          float flowBase = sin(vLocalZ * 0.0004 - uTime * 1.2 * uFlowSpeed);
          float flowLong = 0.85 + flowBase * 0.15;

          float scaleX = ${isIon ? '16.0' : '8.0'};
          float scaleY = ${isIon ? '3.0' : '1.5'};
          float f1 = noise(vec2(vNormX * scaleX, vLocalT * scaleY - uTime * 1.8 * uFlowSpeed));
          float f2 = noise(vec2(vNormX * scaleX * 2.0 + 5.0, vLocalT * scaleY * 2.5 + uTime * 0.8 * uFlowSpeed)) * 0.5;
          float filament = (f1 + f2) / 1.5;
          filament = 0.5 + 0.5 * filament;
          float flow = flowLong * filament;

          // 离子尾脊骨高亮
          float coreGlow = 1.0;
          ${isIon ? `
          float distFromCenter = vNormX;
          coreGlow = exp(-distFromCenter * distFromCenter * 2.5) * 1.2;
          coreGlow += exp(-distFromCenter * distFromCenter * 0.8) * 0.5;
          ` : ''}

          vec3 baseColor = vColor.rgb;
          ${enableRainbow ? `
          float rainIntensity = ${ri.toFixed(2)};
          float rainbowAmount = (0.22 + vLocalT * 0.45) * rainIntensity;
          float dispPos = clamp(vNormX * (0.65 + vLocalT * 0.35), -1.0, 1.0);
          vec3 rainbow = rainbowShift(dispPos + sin(uTime * 0.22) * 0.08);
          baseColor = mix(baseColor, rainbow, rainbowAmount);
          ` : ''}

          float breath = 0.82 + 0.18 * uGlobalBreath;
          float burst = 1.0 + (uBurst - 1.0) * 0.7;

          float alpha = vColor.a * edgeFade * flow * uActivity * breath * burst;
          ${isIon ? `alpha = alpha * 0.65 + coreGlow * 0.35 * uActivity;` : ''}
          alpha = clamp(alpha * uLodFade, 0.0, 1.0);
          if (alpha < 0.0015) discard;

          vec3 finalColor = baseColor;
          ${isIon ? `
          vec3 coreColor = vec3(0.55, 0.85, 1.0);
          vec3 midColor = vec3(0.15, 0.55, 0.95);
          vec3 edgeColor = vec3(0.02, 0.22, 0.70);
          finalColor = mix(edgeColor, midColor, smoothstep(0.0, 0.6, coreGlow));
          finalColor = mix(finalColor, coreColor, smoothstep(0.6, 1.0, coreGlow));
          ` : `finalColor *= (1.0 + (1.0 - abs(vNormX)) * 0.22);`}

          gl_FragColor = vec4(finalColor * (0.85 + 0.15 * breath) * burst * ${gi.toFixed(2)}, alpha);
        }
      `,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.material = mat;
    mesh.userData.isRainbowTail = enableRainbow;
    mesh.userData.isIonTail = isIon;
    return mesh;
  }

  _createCloseParticles(data) {
    const count = 100;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const group = new THREE.Group();
    group.visible = false;

    for (let i = 0; i < count; i++) {
      const theta = Math.PI * 0.20 + Math.random() * Math.PI * 0.55;
      const phi = Math.random() * Math.PI * 2;
      const r = data.nucleusRadius * 1.0 + Math.random() * data.comaRadius * 0.55;
      positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi) * 0.5;
      positions[i * 3 + 2] = r * Math.cos(theta);
      velocities[i * 3] = (Math.random() - 0.5) * 3.0;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 2.0;
      velocities[i * 3 + 2] = 1.5 + Math.random() * 0.8;
      sizes[i] = data.nucleusRadius * (0.30 + Math.random() * 0.55);
      const cm = Math.random();
      colors[i * 3] = 0.35 + 0.35 * cm;
      colors[i * 3 + 1] = 0.25 + 0.35 * (1 - cm);
      colors[i * 3 + 2] = 0.65 + 0.35 * cm;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));

    const gi = this._glowIntensity;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uActivity: { value: 1.0 }, uGlobalBreath: { value: 1.0 }, uBurst: { value: 1.0 } },
      vertexShader: `
        attribute float size; attribute vec3 aColor; attribute vec3 aVelocity;
        varying vec3 vColor; varying float vAlpha;
        uniform float uTime; uniform float uActivity; uniform float uGlobalBreath; uniform float uBurst;
        void main() {
          vec3 pos = position;
          float speed = uActivity * (0.8 + 0.4 * uBurst);
          pos += aVelocity * uTime * 0.4 * speed;
          float spread = abs(pos.z) * 0.03;
          pos.x += sin(pos.z * 0.12 + uTime * 0.6 + aVelocity.x) * spread * speed;
          pos.y += cos(pos.z * 0.09 + uTime * 0.5 + aVelocity.y) * spread * speed;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          float dist = -mv.z;
          float pulse = 1.0 + sin(uTime * 2.0 + position.x * 3.0 + position.y * 4.0) * 0.25;
          float burstScale = 1.0 + (uBurst - 1.0) * 0.5;
          float s = size * pulse * burstScale * (280.0 / dist);
          float breath = 0.80 + 0.20 * uGlobalBreath;
          vAlpha = (0.55 + 0.45 * uActivity) * breath * (0.75 + 0.25 * uBurst) * ${gi.toFixed(2)};
          vColor = aColor * (0.85 + 0.15 * uBurst) * ${gi.toFixed(2)};
          gl_PointSize = clamp(s, 1.0, 50.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float glow1 = exp(-d * d * 2.5);
          float glow2 = exp(-d * d * 8.0) * 0.6;
          float softEdge = 1.0 - smoothstep(0.3, 1.0, d);
          float alpha = (glow1 * 0.7 + glow2 * 0.3) * vAlpha * softEdge;
          if (alpha < 0.005) discard;
          float center = exp(-d * d * 12.0);
          vec3 col = vColor * (1.0 + center * 0.8);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    group.add(points);
    group.userData.particleData = { positions, sizes, colors, velocities, count, comaRadius: data.comaRadius, nucleusRadius: data.nucleusRadius, speed: 0.8 };
    group.userData.particleMat = mat;
    return group;
  }

  _solveKepler(data, M) {
    let E = M;
    for (let i = 0; i < 6; i++) {
      const dE = (E - data.e * Math.sin(E) - M) / (1 - data.e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    const cosE = Math.cos(E), sinE = Math.sin(E);
    const theta = Math.atan2(Math.sqrt(1 - data.e * data.e) * sinE, cosE - data.e);
    const r = data.a * (1 - data.e * cosE);
    const trueAngle = theta + THREE.MathUtils.degToRad(data.ω);
    this._orbitPos.set(
      r * Math.cos(trueAngle),
      r * Math.sin(trueAngle) * Math.cos(THREE.MathUtils.degToRad(data.i)),
      r * Math.sin(trueAngle) * Math.sin(THREE.MathUtils.degToRad(data.i))
    );
  }

  _computeActivity(data, r) {
    const rP = data.perihelion, rA = data.a * (1 + data.e);
    return THREE.MathUtils.clamp(1.0 - THREE.MathUtils.smoothstep(rP * 1.5, rA * 0.7, r), 0.05, 1.0);
  }

  update(delta, elapsed) {
    const globalBreath = 0.78 + 0.22 * Math.sin(elapsed * GLOBAL_BREATH_SPEED);

    for (let ci = 0; ci < this.comets.length; ci++) {
      const comet = this.comets[ci];
      const d = comet.data;

      if (comet.currentM === undefined) comet.currentM = comet.M0;
      comet.currentM = (comet.currentM + comet.meanMotion * delta) % (Math.PI * 2);

      this._solveKepler(d, comet.currentM);
      comet.group.position.copy(this._orbitPos);

      if (this._orbitPos.lengthSq() > 1e-6) {
        this._tailTo.copy(this._orbitPos).negate().normalize();
        this._tailQ.setFromUnitVectors(this._tailFrom, this._tailTo);
        comet.tailGroup.quaternion.copy(this._tailQ);
        comet.coma.quaternion.copy(this._tailQ);
      }

      const r = this._orbitPos.length();
      const activity = this._computeActivity(d, r);

      this._burstTimers[ci] += delta;
      let burst = 1.0;
      if (activity > 0.25) {
        const burstInterval = BURST_INTERVAL * (1.8 - activity * 0.8);
        if (this._burstTimers[ci] > burstInterval) this._burstTimers[ci] = 0;
        const burstPhase = this._burstTimers[ci] / burstInterval;
        if (burstPhase < 0.10) {
          burst = 1.0 + 0.9 * (1.0 - burstPhase / 0.10) * activity;
        } else if (burstPhase < 0.30) {
          const decayT = (burstPhase - 0.10) / 0.20;
          burst = 1.0 + 0.9 * activity * (1.0 - decayT * decayT);
        } else {
          burst = 1.0 + 0.12 * Math.sin(burstPhase * 10.0 + ci) * activity * Math.max(0, 1.0 - (burstPhase - 0.30) * 1.5);
        }
      }

      for (const mesh of comet.tailMeshes) {
        const mat = mesh.userData?.material;
        if (mat?.uniforms) {
          mat.uniforms.uActivity.value = activity;
          mat.uniforms.uTime.value = elapsed;
          mat.uniforms.uGlobalBreath.value = globalBreath;
          mat.uniforms.uBurst.value = burst;
        }
      }

      if (comet.coma.userData?.material?.uniforms) {
        const u = comet.coma.userData.material.uniforms;
        u.uActivity.value = activity; u.uTime.value = elapsed;
        u.uGlobalBreath.value = globalBreath; u.uBurst.value = burst;
      }

      comet.nucleus.traverse((child) => {
        if (child.userData?.material?.uniforms) {
          const u = child.userData.material.uniforms;
          if (u.uActivity) u.uActivity.value = activity;
          if (u.uTime) u.uTime.value = elapsed;
          if (u.uGlobalBreath) u.uGlobalBreath.value = globalBreath;
          if (u.uBurst) u.uBurst.value = burst;
        }
      });

      if (this._camera) {
        comet.group.getWorldPosition(this._tmpWorld);
        const camDist = this._tmpWorld.distanceTo(this._camera.position);
        let lodFade = 1.0;
        if (camDist > LOD_FADE_START) {
          if (camDist < LOD_FAR) lodFade = 1.0 - (camDist - LOD_FADE_START) / (LOD_FAR - LOD_FADE_START) * 0.8;
          else if (camDist < LOD_VERY_FAR) lodFade = 0.2 * (1.0 - (camDist - LOD_FAR) / (LOD_VERY_FAR - LOD_FAR));
          else lodFade = 0;
        }
        comet.group.visible = lodFade > 0.001;

        if (lodFade > 0.001) {
          const distScale = 0.08 + 0.92 * activity;
          comet.tailGroup.scale.setScalar(distScale * (0.3 + 0.7 * lodFade));
          const comaScale = 0.10 + 0.90 * activity;
          const breathScale = 0.90 + 0.10 * globalBreath;
          const fadeScale = 0.2 + 0.8 * lodFade;
          comet.coma.scale.set(comaScale * breathScale * fadeScale, comaScale * breathScale * fadeScale, comaScale * 1.35 * breathScale * fadeScale);
          comet.coma.visible = true; comet.tailGroup.visible = true;

          for (const mesh of comet.tailMeshes) {
            const mat = mesh.userData?.material;
            if (mat?.uniforms) { mat.uniforms.uLodFade = mat.uniforms.uLodFade || { value: 1.0 }; mat.uniforms.uLodFade.value = lodFade; }
          }
          if (comet.coma.userData?.material?.uniforms) {
            const u = comet.coma.userData.material.uniforms;
            u.uLodFade = u.uLodFade || { value: 1.0 }; u.uLodFade.value = lodFade;
          }
          comet.nucleus.traverse((child) => {
            if (child.userData?.material?.uniforms) {
              const u = child.userData.material.uniforms;
              u.uLodFade = u.uLodFade || { value: 1.0 }; u.uLodFade.value = lodFade;
            }
          });
        } else { comet.coma.visible = false; comet.tailGroup.visible = false; }

        const close = camDist < CLOSE_PARTICLE_DIST;
        comet.closeParticles.visible = close;
        if (close) this._updateCloseParticles(comet.closeParticles, delta, activity, elapsed, globalBreath, burst);
      }
    }
  }

  _updateCloseParticles(group, delta, activity, elapsed, globalBreath, burst) {
    const pd = group.userData.particleData;
    const pos = pd.positions, sizes = pd.sizes, colors = pd.colors;
    const maxR = pd.comaRadius * 1.2;
    for (let i = 0; i < pd.count; i++) {
      const idx = i * 3;
      pos[idx + 2] += pd.speed * delta * activity * (0.8 + 0.6 * burst);
      const t = Math.max(0, pos[idx + 2]) / maxR;
      const spread = t * 5.0;
      pos[idx] += Math.sin(pos[idx + 2] * 0.10 + i * 1.7 + elapsed * 0.4) * spread * delta * 5.0 * burst;
      pos[idx + 1] += Math.cos(pos[idx + 2] * 0.08 + i * 2.3 + elapsed * 0.3) * spread * delta * 4.0 * burst;
      const breathFactor = 0.85 + 0.15 * globalBreath;
      sizes[i] = pd.nucleusRadius * (0.25 + t * 1.1) * breathFactor * (0.85 + 0.30 * burst);
      const mixT = Math.min(t, 1.0);
      colors[idx] = 0.45 * (1 - mixT) + 0.08 * mixT;
      colors[idx + 1] = 0.22 * (1 - mixT) + 0.45 * mixT;
      colors[idx + 2] = 0.70 * (1 - mixT) + 0.90 * mixT;
      if (pos[idx + 2] > maxR * 0.55 || pos[idx + 2] < -maxR * 0.5) {
        const theta = Math.PI * 0.20 + Math.random() * Math.PI * 0.50, phi = Math.random() * Math.PI * 2;
        const r = pd.nucleusRadius * 1.0 + Math.random() * (Math.max(0.01, maxR * 0.35 - pd.nucleusRadius));
        pos[idx] = r * Math.sin(theta) * Math.cos(phi);
        pos[idx + 1] = r * Math.sin(theta) * Math.sin(phi) * 0.4;
        pos[idx + 2] = r * Math.cos(theta);
        sizes[i] = pd.nucleusRadius * (0.20 + Math.random() * 0.30);
        const cm = Math.random();
        colors[idx] = 0.35 + 0.30 * cm; colors[idx + 1] = 0.22 + 0.30 * (1 - cm); colors[idx + 2] = 0.65 + 0.30 * cm;
      }
    }
    const points = group.children[0];
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.size.needsUpdate = true;
    points.geometry.attributes.aColor.needsUpdate = true;
    const mat = group.userData.particleMat;
    if (mat && mat.uniforms) {
      mat.uniforms.uActivity.value = activity; mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uGlobalBreath.value = globalBreath; mat.uniforms.uBurst.value = burst;
    }
  }

  dispose() {
    for (const comet of this.comets) {
      comet.group.traverse((child) => { if (child.geometry) child.geometry.dispose(); if (child.material) child.material.dispose(); });
    }
    this.comets = []; this._burstTimers = [];
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
