/**
 * 彗星系统 v4.2 — 梦幻科幻视觉升级（极致版）
 * 对标《星际穿越》奇幻天体感
 *
 * 核心升级：
 * - 整体亮度与辉光显著提升，AdditiveBlending 极致运用
 * - 尘埃尾宽厚飘逸（多层 Ribbon + 彩虹色散 + 梦幻波纹）
 * - 离子尾锐利能量光束（中心亮轨 + 横向扩散 + 幽蓝辉光）
 * - 彗发发光云团（3D FBM 体积噪声 + 向阳辉光 + 彩色 Fresnel + 晶格脉动）
 * - 近距粒子魔法发光喷射（穿梭尘埃感）
 * - 全局呼吸脉动 + 活跃度联动爆发
 * - 全部参数从 config.comets 读取，可实时调节
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

// ==================== 彗星数据 — 蓝紫青主色调 + 彩虹基座 ====================
const COMET_DATA = [
  {
    id: 'halley', name: '1P/Halley', nameCN: '哈雷彗星',
    lastPerihelionMs: Date.UTC(1986, 1, 9),
    a: 6200, e: 0.967, i: 162, ω: 111, periodDays: 27759,
    nucleusRadius: 1.8, comaRadius: 18,
    dustLen: 450, dustHalfW: 4.8, ionLen: 550, ionHalfW: 0.7,
    dustInner: [0.55, 0.22, 0.78],   // 高饱和度紫晶
    dustOuter: [0.12, 0.48, 0.88],   // 明亮青蓝
    ionColor:  [0.05, 0.55, 0.98],   // 亮蓝-青
    perihelion: 204.6,
  },
  {
    id: 'halebopp', name: 'C/1995 O1', nameCN: '海尔-波普彗星',
    lastPerihelionMs: Date.UTC(1997, 3, 1),
    a: 8000, e: 0.975, i: 89, ω: 130, periodDays: 912500,
    nucleusRadius: 2.5, comaRadius: 30,
    dustLen: 700, dustHalfW: 7.2, ionLen: 850, ionHalfW: 1.0,
    dustInner: [0.50, 0.20, 0.80],
    dustOuter: [0.10, 0.45, 0.90],
    ionColor:  [0.03, 0.52, 0.98],
    perihelion: 200.0,
  },
  {
    id: 'encke', name: '2P/Encke', nameCN: '恩克彗星',
    lastPerihelionMs: Date.UTC(2023, 9, 22),
    a: 1500, e: 0.848, i: 12, ω: 186, periodDays: 1205,
    nucleusRadius: 1.3, comaRadius: 10,
    dustLen: 280, dustHalfW: 3.0, ionLen: 380, ionHalfW: 0.5,
    dustInner: [0.52, 0.24, 0.72],
    dustOuter: [0.14, 0.48, 0.84],
    ionColor:  [0.06, 0.56, 0.94],
    perihelion: 228.0,
  },
  {
    id: 'swifttuttle', name: '109P/Swift-Tuttle', nameCN: '斯威夫特-塔特尔彗星',
    lastPerihelionMs: Date.UTC(1992, 11, 11),
    a: 5500, e: 0.963, i: 113, ω: 153, periodDays: 48545,
    nucleusRadius: 2.0, comaRadius: 22,
    dustLen: 500, dustHalfW: 5.4, ionLen: 650, ionHalfW: 0.77,
    dustInner: [0.52, 0.20, 0.76],
    dustOuter: [0.12, 0.46, 0.88],
    ionColor:  [0.04, 0.52, 0.97],
    perihelion: 203.5,
  },
];

// ==================== 全局常量（部分从 config 读取）====================
const _cfg = config.comets || {};
// v-latest: 公转速度（UX 优先 — 让慢彗星也能被看见）
// 真实彗星周期相差近 760 倍（恩克约3.3年 vs 海尔-波普约2500年）。若与行星用同一时间
// 倍率，最慢彗星一圈需数小时，几乎不动。故对周期做指数压缩(指数<1)，在保留“真实快慢
// 顺序”的前提下把最慢彗星压到 ORBIT_BASE_SECONDS 秒可见。轨道形状(a/e/i/ω)仍完全写实。
const ORBIT_TIME_SCALE = _cfg.orbitTimeScale ?? 1.0;       // 全局倍率，>1 更快
const ORBIT_PERIOD_COMPRESS = _cfg.orbitPeriodCompress ?? (1 / 3); // 压缩指数
const ORBIT_BASE_SECONDS = _cfg.orbitBaseSeconds ?? 90;     // 最慢彗星视觉公转时长(秒)
const MAX_PERIOD_DAYS = Math.max(...COMET_DATA.map((d) => d.periodDays));
const LOD_FAR = 45000;
const LOD_VERY_FAR = 100000;
const LOD_FADE_START = 25000;   // 超过此距离开始淡出
const CLOSE_PARTICLE_DIST = 300;
const DUST_FLOW = 1.0;
const ION_FLOW = 2.5;

// 从 config 读取可调参数（带默认值）
const GLOBAL_BREATH_SPEED = _cfg.globalBreathSpeed ?? 0.55;
const BURST_INTERVAL = _cfg.burstInterval ?? 5.0;
const COMA_NOISE_SPEED = _cfg.comaNoiseSpeed ?? 0.25;
const TAIL_WAVE_AMP = _cfg.tailWaveAmplitude ?? 1.0;
const RAINBOW_INTENSITY = _cfg.rainbowIntensity ?? 1.0;
const GLOW_INTENSITY = _cfg.glowIntensity ?? 1.0;

// ==================== 共享着色器噪声函数 ====================
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
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 3; i++) {
      v += a * noise3(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
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

// ==================== 彩虹色散函数 ====================
const RAINBOW_GLSL = `
  vec3 rainbowShift(float t) {
    float hue = 0.48 + t * 0.18;
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
    // 饱和度增强
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, 1.5);
    return col;
  }
`;

// ==================== 主类 ====================
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
    // 从 config 读取可调参数
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
    console.log(`[Comets] v4.2 ${COMET_DATA.length}颗彗星 — 梦幻科幻极致版 (glow=${this._glowIntensity}, rainbow=${this._rainbowIntensity})`);
  }

  // ==================== 创建单颗彗星 ====================
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

    const curve = 0.0012;

    // ---- 尘埃尾：4层×十字=8条 — 增强体积感与彩虹色散 ----
    // 第1层：核心致密紫晶带
    this._addTailPair(comet, data.dustLen, data.dustHalfW * 0.30, 64,
      data.dustInner, 0.28, curve * 0.6, DUST_FLOW, true);
    // 第2层：主带蓝紫
    this._addTailPair(comet, data.dustLen, data.dustHalfW * 0.70, 64,
      data.dustInner, 0.18, curve * 0.9, DUST_FLOW, true);
    // 第3层：扩散层青蓝
    this._addTailPair(comet, data.dustLen * 1.0, data.dustHalfW * 1.3, 60,
      data.dustOuter, 0.09, curve, DUST_FLOW, true);
    // 第4层：超宽外层辉光晕（体积感的关键）
    this._addTailPair(comet, data.dustLen * 0.85, data.dustHalfW * 3.5, 48,
      data.dustOuter, 0.035, curve * 0.4, DUST_FLOW, true);
    // 第5层：最外层超宽薄晕（接近透明，扩展视觉范围）
    this._addTailPair(comet, data.dustLen * 0.70, data.dustHalfW * 6.0, 40,
      [0.05, 0.30, 0.70], 0.015, curve * 0.2, DUST_FLOW, true);

    // ---- 离子尾：1层×十字=2条 — 锐利能量光束 ----
    this._addTailPair(comet, data.ionLen * 1.2, data.ionHalfW, 44,
      data.ionColor, 0.22, 0, ION_FLOW, false);

    comet.group.add(comet.tailGroup);

    // 实时 M0
    const nowMs = Date.now();
    const elapsedDays = (nowMs - data.lastPerihelionMs) / 86400000;
    const frac = (elapsedDays % data.periodDays) / data.periodDays;
    comet.M0 = frac * Math.PI * 2;

    // v-latest: 由“压缩后的视觉周期”推导平均角速度(rad/s)，与帧率无关。
    // 真实周期越短 → 视觉周期越短 → 角速度越大（保留真实快慢顺序）。
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

  // ==================== 彗核（强化辉光） ====================
  _createNucleus(data) {
    const geo = new THREE.SphereGeometry(data.nucleusRadius, 14, 14);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.70, 0.50, 0.85), // 紫晶色
    });
    const mesh = new THREE.Mesh(geo, mat);

    const gi = this._glowIntensity;

    // 外层发光光环
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
        uniform float uTime;uniform float uActivity;uniform float uGlobalBreath;uniform float uBurst;
        uniform float uLodFade;
        void main(){
          vec3 vd=normalize(cameraPosition-vW);float r=length(vL);float nr=r/3.5;
          float d=exp(-nr*nr*4.5);float rim=1.0-abs(dot(normalize(vN),vd));float rg=pow(rim,2.2)*0.5;
          float br=0.78+0.22*uGlobalBreath;float bu=1.0+(uBurst-1.0)*0.5;
          float alpha=(d*0.4+rg)*uActivity*br*bu*${gi.toFixed(2)};alpha=clamp(alpha,0.0,0.8);if(alpha<0.003)discard;
          float mt=nr;vec3 ic=vec3(0.60,0.25,0.85);vec3 oc=vec3(0.12,0.55,0.92);
          vec3 col=mix(ic,oc,mt);vec3 rc=mix(vec3(0.65,0.12,0.75),vec3(0.15,0.55,0.88),rim);
          col=mix(col,rc,rg*2.5);gl_FragColor=vec4(col*(1.0+rg*0.8)*br*bu,alpha*uLodFade);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    mesh.add(new THREE.Mesh(glowGeo, glowMat));

    // 内层致密光晕
    const innerGlowGeo = new THREE.SphereGeometry(data.nucleusRadius * 2.2, 12, 12);
    const innerGlowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uActivity: { value: 1.0 },
        uGlobalBreath: { value: 1.0 }, uBurst: { value: 1.0 },
        uLodFade: { value: 1.0 },
      },
      vertexShader: `varying vec3 vN;varying vec3 vW;
        void main(){vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `precision highp float;varying vec3 vN;varying vec3 vW;
        uniform float uTime;uniform float uActivity;uniform float uGlobalBreath;uniform float uBurst;
        uniform float uLodFade;
        void main(){
          vec3 vd=normalize(cameraPosition-vW);float rim=1.0-abs(dot(normalize(vN),vd));
          float g=exp(-rim*5.0)*0.7;float br=0.85+0.15*uGlobalBreath;float bu=1.0+(uBurst-1.0)*0.4;
          float alpha=g*uActivity*br*bu*${gi.toFixed(2)};if(alpha<0.003)discard;
          vec3 col=mix(vec3(0.55,0.18,0.80),vec3(0.25,0.60,0.92),rim);gl_FragColor=vec4(col*1.5*br*bu,alpha*uLodFade);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    mesh.add(new THREE.Mesh(innerGlowGeo, innerGlowMat));

    return mesh;
  }

  // ==================== 彗发：梦幻发光云团（极致版） ====================
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
      vertexShader: `varying vec3 vN;varying vec3 vW;varying vec3 vL;
        void main(){vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xyz;vL=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        precision highp float;
        varying vec3 vN; varying vec3 vW; varying vec3 vL;
        uniform vec3 uColor; uniform float uActivity; uniform float uTime;
        uniform float uGlobalBreath; uniform float uBurst;
        uniform float uLodFade;
        ${NOISE_3D_GLSL}
        void main(){
          vec3 vd=normalize(cameraPosition-vW);
          float r=length(vL);float nr=r/${cr};

          // ---- 多层体积密度 ----
          float density=exp(-nr*nr*3.0);

          // 4层 FBM 噪声（从 3→4 层，更丰富云团纹理）
          vec3 np=vL*0.15+uTime*${(COMA_NOISE_SPEED * 1.2).toFixed(2)};
          float noiseVal=fbm4(np);
          density*=(1.0+(noiseVal-0.4)*0.45);

          // 高频细节噪声
          float n2=noise3(vL*0.35+uTime*0.6);
          density*=(0.80+(n2-0.45)*0.22);

          // ---- 向阳辉光（大幅增强）----
          float sunFace=smoothstep(-0.30,0.40,-vL.z/${cr});
          float sunPulse=1.0+sin(uTime*1.8+sunFace*5.0)*0.10;
          float sunBoost=(1.0+sunFace*0.50)*sunPulse;

          // ---- Fresnel 边缘光（增强+彩色）----
          float rim=1.0-abs(dot(normalize(vN),vd));
          float rimAlpha=pow(rim,2.5)*0.40;

          // 边缘彩色光晕 — 紫→品红→青渐变
          vec3 rimCol1=vec3(0.70,0.10,0.80);  // 亮紫
          vec3 rimCol2=vec3(0.05,0.55,0.90);  // 青
          vec3 rimCol=mix(rimCol1,rimCol2,rim*2.5);

          // 额外彩虹边缘
          vec3 rimRainbow=0.5+0.5*cos(6.28318*(rim*0.3+vec3(0.0,0.33,0.67)));
          rimCol=mix(rimCol,rimRainbow,0.3);

          // ---- 呼吸脉动（加强幅度）----
          float breath=0.75+0.25*uGlobalBreath;

          // ---- 爆发亮度（强化）----
          float burst=1.0+(uBurst-1.0)*uActivity*1.2;

          // ---- 合成 ----
          float alpha=(density*0.65+rimAlpha*0.40)*sunBoost*uActivity*breath*burst*${gi.toFixed(2)};
          alpha=clamp(alpha,0.0,0.98);
          if(alpha<0.003)discard;

          // 颜色：内部紫 → 外部蓝青
          float cm=nr*0.75+noiseVal*0.25;
          vec3 innerCol=uColor*1.4;
          vec3 outerCol=vec3(0.08,0.50,0.85);
          vec3 col=mix(innerCol,outerCol,clamp(cm,0.0,1.0));

          // Fresnel 贡献
          col=mix(col,rimCol,rimAlpha*2.0);

          // 亮度增强
          float brightness=(1.0+rimAlpha*0.5)*(0.85+0.15*breath)*burst;
          col*=brightness;

          // 整体辉光 boost
          col*=${gi.toFixed(2)};

          gl_FragColor=vec4(col,alpha*uLodFade);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.material = mat;
    return mesh;
  }

  // ==================== 尾部 Ribbon（v4.2: 极致增强版）====================
  _createTailRibbon(length, halfWidth, segments, colorArr, maxAlpha, curvature, flowSpeed, enableRainbow) {
    const vertCount = (segments + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const RGBA = new Float32Array(vertCount * 4);
    const indices = [];
    const [cr, cg, cb] = colorArr;
    const gi = this._glowIntensity;
    const ri = this._rainbowIntensity;
    const twa = this._tailWaveAmp;
    const lengthStr = length.toFixed(1);

    // 宽度：根部极窄 → 远端极宽（体积感）
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -t * length;
      // 更夸张的宽度变化：根部 0.08× → 远端 1.0×
      const w = halfWidth * (0.08 + t * 0.92);
      const curveX = curvature * z * z;
      // 透明度：远端更柔和，用更高指数让边缘更透
      const tailAlpha = maxAlpha * Math.pow(Math.max(1.0 - t, 0.001), 3.2);

      const li = i * 2;
      positions[li * 3] = -w + curveX;
      positions[li * 3 + 1] = 0;
      positions[li * 3 + 2] = z;
      RGBA[li * 4] = cr;
      RGBA[li * 4 + 1] = cg;
      RGBA[li * 4 + 2] = cb;
      RGBA[li * 4 + 3] = tailAlpha * (0.80 + t * 0.20);

      const ri_pos = i * 2 + 1;
      positions[ri_pos * 3] = w + curveX;
      positions[ri_pos * 3 + 1] = 0;
      positions[ri_pos * 3 + 2] = z;
      RGBA[ri_pos * 4] = cr;
      RGBA[ri_pos * 4 + 1] = cg;
      RGBA[ri_pos * 4 + 2] = cb;
      RGBA[ri_pos * 4 + 3] = tailAlpha * (0.80 + t * 0.20);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRGBA', new THREE.BufferAttribute(RGBA, 4));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const isIon = !enableRainbow;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHalfWidth: { value: halfWidth }, uActivity: { value: 1.0 },
        uTime: { value: 0 }, uFlowSpeed: { value: flowSpeed || 1.0 },
        uGlobalBreath: { value: 1.0 }, uBurst: { value: 1.0 },
        uLodFade: { value: 1.0 },
      },
      vertexShader: `
        attribute vec4 aRGBA;
        varying vec4 vColor; varying float vDistX; varying float vLocalZ; varying float vLocalT;
        uniform float uTime; uniform float uActivity; uniform float uHalfWidth;

        void main() {
          vec3 pos = position;

          // ---- 增强型梦幻波纹扰动 ----
          float amp = ${twa.toFixed(2)};
          // 低频主波（丝绸飘逸）
          float mainWave = sin(pos.z * 0.0035 + uTime * 0.9) * uHalfWidth * 0.22 * amp;
          // 中频次波
          float secWave = sin(pos.z * 0.016 - uTime * 2.5) * cos(pos.z * 0.010 + uTime * 1.3) * uHalfWidth * 0.12 * amp;
          // 高频微颤（生命感）
          float micro = (sin(pos.z * 0.055 + uTime * 5.5) * cos(pos.z * 0.035 - uTime * 3.0)
                      + sin(pos.z * 0.08 - uTime * 7.0 + pos.x * 0.02)) * uHalfWidth * 0.05 * amp;

          float wave = (mainWave + secWave + micro) * uActivity;
          ${isIon ? 'wave *= 0.35;' : 'wave *= 1.2;'}
          pos.x += wave;

          // 尾部远端扰动显著放大（飘逸感）
          float tNorm = clamp(-pos.z / ${lengthStr}, 0.0, 1.0);
          pos.x += wave * tNorm * 0.8;

          vColor = aRGBA;
          vDistX = pos.x;
          vLocalZ = pos.z;
          vLocalT = tNorm;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vColor; varying float vDistX; varying float vLocalZ; varying float vLocalT;
        uniform float uHalfWidth; uniform float uActivity; uniform float uTime;
        uniform float uFlowSpeed; uniform float uGlobalBreath; uniform float uBurst;
        uniform float uLodFade;
        ${RAINBOW_GLSL}

        void main() {
          // ---- 边缘淡出（更柔和）----
          float normX = abs(vDistX) / max(uHalfWidth * 0.75, 0.001);
          float edgeFade = exp(-normX * normX * 3.0);

          // ---- 流动波纹（大幅增强）----
          float flowBase = sin(vLocalZ * 0.012 - uTime * 3.5 * uFlowSpeed);
          float flow1 = flowBase * 0.22;
          float flow2 = sin(vLocalZ * 0.035 + uTime * 2.5 * uFlowSpeed) * 0.10;
          float flow3 = sin(vLocalZ * 0.06 - uTime * 5.0 * uFlowSpeed) * cos(vLocalZ * 0.04 + uTime * 3.0 * uFlowSpeed) * 0.07;
          float flow4 = sin(vLocalZ * 0.10 + uTime * 1.2 * uFlowSpeed + vDistX * 0.01) * 0.04;
          float dynAmp = 0.4 + 0.6 * uActivity;
          float flow = 0.78 + (flow1 + flow2 + flow3 + flow4) * dynAmp;

          // ---- 离子尾：中心高亮光轨（极致版）----
          float coreGlow = 1.0;
          ${isIon ? `
          float distFromCenter = normX;
          coreGlow = exp(-distFromCenter * distFromCenter * 12.0) * 1.2;
          coreGlow += exp(-distFromCenter * distFromCenter * 3.0) * 0.5;
          coreGlow += exp(-distFromCenter * distFromCenter * 0.8) * 0.2;
          ` : ''}

          // ---- 彩虹色散（尘埃尾，大幅强化）----
          vec3 baseColor = vColor.rgb;
          ${enableRainbow ? `
          float rainIntensity = ${ri.toFixed(2)};
          float rainbowAmount = (0.30 + vLocalT * 0.50) * rainIntensity;
          float dispPos = clamp(vDistX / max(uHalfWidth * 0.55, 0.001), -1.0, 1.0);
          // 加入时间微变，产生流动彩虹
          float timeShift = sin(uTime * 0.3) * 0.05;
          vec3 rainbow = rainbowShift(dispPos * (0.5 + vLocalT * 0.4) + timeShift);
          float rainWeight = rainbowAmount * (0.35 + vLocalT * 0.65);
          baseColor = mix(baseColor, rainbow, rainWeight);
          // 额外：远端+横向边缘彩虹更强
          float extraRain = (1.0 - edgeFade) * vLocalT * 0.3 * rainIntensity;
          baseColor = mix(baseColor, rainbowShift(dispPos * 0.8), extraRain);
          // 色彩饱和度大幅增强
          float gray = dot(baseColor, vec3(0.299, 0.587, 0.114));
          baseColor = mix(vec3(gray), baseColor, 1.5);
          ` : ''}

          // ---- 呼吸脉动 + 爆发（强化）----
          float breath = 0.82 + 0.18 * uGlobalBreath;
          float burst = 1.0 + (uBurst - 1.0) * 0.7;

          // ---- 合成 ----
          float glowBoost = ${gi.toFixed(2)};
          float alpha = vColor.a * edgeFade * flow * uActivity * breath * burst * glowBoost;
          ${isIon ? `
          alpha *= (0.92 + 0.08 * (1.0 - vLocalT));
          alpha += coreGlow * 0.20 * uActivity * glowBoost;
          ` : `
          alpha *= (0.80 + 0.20 * (1.0 - vLocalT));
          `}
          alpha = clamp(alpha, 0.0, 1.0);
          if (alpha < 0.0015) discard;

          // 最终颜色
          vec3 finalColor = baseColor;
          ${isIon ? `
          // 离子尾：极致中心能量光束
          vec3 coreColor = vec3(0.50, 0.80, 1.0);
          vec3 midColor = vec3(0.20, 0.50, 0.95);
          vec3 edgeColor = vec3(0.02, 0.30, 0.75);
          finalColor = mix(edgeColor, midColor, smoothstep(0.0, 0.5, coreGlow));
          finalColor = mix(finalColor, coreColor, smoothstep(0.5, 1.0, coreGlow));
          // 辉光倍增
          finalColor *= (1.0 + coreGlow * 0.8);
          // 时间脉动
          float pulse = 1.0 + sin(uTime * 2.0 * uFlowSpeed + vLocalT * 4.0) * 0.08;
          finalColor *= pulse;
          ` : `
          // 尘埃尾：横向亮度增强
          finalColor *= (1.0 + (1.0 - normX) * 0.20);
          // 远端微微变亮
          finalColor *= (1.0 + vLocalT * 0.1);
          `}

          // 呼吸 & 爆发调制亮度
          gl_FragColor = vec4(finalColor * (0.85 + 0.15 * breath) * burst * glowBoost, alpha * uLodFade);
        }
      `,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.material = mat;
    mesh.userData.isRainbowTail = enableRainbow;
    mesh.userData.isIonTail = isIon;
    return mesh;
  }

  // ==================== 近距离粒子：魔法发光尘埃喷射 ====================
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
      uniforms: {
        uTime: { value: 0 }, uActivity: { value: 1.0 },
        uGlobalBreath: { value: 1.0 }, uBurst: { value: 1.0 },
      },
      vertexShader: `
        attribute float size; attribute vec3 aColor; attribute vec3 aVelocity;
        varying vec3 vColor; varying float vAlpha;
        uniform float uTime; uniform float uActivity;
        uniform float uGlobalBreath; uniform float uBurst;

        void main() {
          vec3 pos = position;
          // 尾方向快速漂移（穿梭感）
          float speed = uActivity * (0.8 + 0.4 * uBurst);
          pos += aVelocity * uTime * 0.4 * speed;

          // 横向扩散增强
          float spread = abs(pos.z) * 0.03;
          pos.x += sin(pos.z * 0.12 + uTime * 0.6 + aVelocity.x) * spread * speed;
          pos.y += cos(pos.z * 0.09 + uTime * 0.5 + aVelocity.y) * spread * speed;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          float dist = -mv.z;

          // 大小：大幅脉动 + 爆发
          float pulse = 1.0 + sin(uTime * 2.0 + position.x * 3.0 + position.y * 4.0) * 0.25;
          float burstScale = 1.0 + (uBurst - 1.0) * 0.5;
          float s = size * pulse * burstScale * (280.0 / dist);

          // 透明度：随活动度 + 呼吸 + 爆发
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
          // 梦幻光晕圆点（多重发光）
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float glow1 = exp(-d * d * 2.5);
          float glow2 = exp(-d * d * 8.0) * 0.6;
          float softEdge = 1.0 - smoothstep(0.3, 1.0, d);
          float alpha = (glow1 * 0.7 + glow2 * 0.3) * vAlpha * softEdge;
          if (alpha < 0.005) discard;

          // 中心高亮
          float center = exp(-d * d * 12.0);
          vec3 col = vColor * (1.0 + center * 0.8);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    group.add(points);

    group.userData.particleData = {
      positions, sizes, colors, velocities, count,
      comaRadius: data.comaRadius,
      nucleusRadius: data.nucleusRadius,
      speed: 0.8,
    };
    group.userData.particleMat = mat;
    return group;
  }

  // ==================== 开普勒方程 ====================
  _solveKepler(data, M) {
    let E = M;
    for (let i = 0; i < 6; i++) {
      const dE = (E - data.e * Math.sin(E) - M) / (1 - data.e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
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
    const rP = data.perihelion;
    const rA = data.a * (1 + data.e);
    const act = 1.0 - THREE.MathUtils.smoothstep(rP * 1.5, rA * 0.7, r);
    return THREE.MathUtils.clamp(act, 0.05, 1.0);
  }

  // ==================== 每帧更新 ====================
  update(delta, elapsed) {
    // ---- 全局呼吸脉动（增强幅度）----
    const globalBreath = 0.78 + 0.22 * Math.sin(elapsed * GLOBAL_BREATH_SPEED);

    for (let ci = 0; ci < this.comets.length; ci++) {
      const comet = this.comets[ci];
      const d = comet.data;
      // v-latest: 用预计算的 meanMotion(rad/s) 直接驱动，帧率无关且可观赏
      const M = (comet.M0 + comet.meanMotion * elapsed) % (Math.PI * 2);
      this._solveKepler(d, M);
      comet.group.position.copy(this._orbitPos);

      // 尾部方向 = 背向太阳（真实彗星尾方向，开普勒远日点速度慢时也稳定无抖动）
      if (this._orbitPos.lengthSq() > 1e-6) {
        this._tailTo.copy(this._orbitPos).negate().normalize();
        this._tailQ.setFromUnitVectors(this._tailFrom, this._tailTo);
        comet.tailGroup.quaternion.copy(this._tailQ);
        comet.coma.quaternion.copy(this._tailQ);
      }

      const r = this._orbitPos.length();
      const activity = this._computeActivity(d, r);

      // ---- 活跃度联动爆发（强化版）----
      this._burstTimers[ci] += delta;
      let burst = 1.0;
      if (activity > 0.25) {
        const burstInterval = BURST_INTERVAL * (1.8 - activity * 0.8);
        if (this._burstTimers[ci] > burstInterval) {
          this._burstTimers[ci] = 0;
        }
        const burstPhase = this._burstTimers[ci] / burstInterval;
        if (burstPhase < 0.10) {
          // 快速上升爆发（更强）
          burst = 1.0 + 0.9 * (1.0 - burstPhase / 0.10) * activity;
        } else if (burstPhase < 0.30) {
          // 快速衰减阶段
          const decayT = (burstPhase - 0.10) / 0.20;
          burst = 1.0 + 0.9 * activity * (1.0 - decayT * decayT);
        } else {
          // 残余呼吸波动（带微弱脉冲）
          burst = 1.0 + 0.12 * Math.sin(burstPhase * 10.0 + ci) * activity
                    * Math.max(0, 1.0 - (burstPhase - 0.30) * 1.5);
        }
      }

      // ---- 彗尾 uniforms 更新（由下方 LOD 段控制缩放）----
      for (const mesh of comet.tailMeshes) {
        const mat = mesh.userData?.material;
        if (mat?.uniforms) {
          mat.uniforms.uActivity.value = activity;
          mat.uniforms.uTime.value = elapsed;
          mat.uniforms.uGlobalBreath.value = globalBreath;
          mat.uniforms.uBurst.value = burst;
        }
      }

      // ---- 彗发 uniforms 更新（由下方 LOD 段控制缩放）----
      if (comet.coma.userData?.material?.uniforms) {
        const u = comet.coma.userData.material.uniforms;
        u.uActivity.value = activity;
        u.uTime.value = elapsed;
        u.uGlobalBreath.value = globalBreath;
        u.uBurst.value = burst;
      }

      // ---- 彗核辉光更新 ----
      comet.nucleus.traverse((child) => {
        if (child.userData?.material?.uniforms) {
          const u = child.userData.material.uniforms;
          if (u.uActivity) u.uActivity.value = activity;
          if (u.uTime) u.uTime.value = elapsed;
          if (u.uGlobalBreath) u.uGlobalBreath.value = globalBreath;
          if (u.uBurst) u.uBurst.value = burst;
        }
      });

      // ---- LOD + 距离淡出 + 粒子 ----
      if (this._camera) {
        comet.group.getWorldPosition(this._tmpWorld);
        const camDist = this._tmpWorld.distanceTo(this._camera.position);

        // 距离淡出系数：25000~45000 之间从 1.0 平滑降到 0.2，45000+ 逐渐归零
        let lodFade = 1.0;
        if (camDist > LOD_FADE_START) {
          if (camDist < LOD_FAR) {
            lodFade = 1.0 - (camDist - LOD_FADE_START) / (LOD_FAR - LOD_FADE_START) * 0.8;
          } else if (camDist < LOD_VERY_FAR) {
            lodFade = 0.2 * (1.0 - (camDist - LOD_FAR) / (LOD_VERY_FAR - LOD_FAR));
          } else {
            lodFade = 0;
          }
        }
        comet.group.visible = lodFade > 0.001;

        // 淡出影响：彗尾缩放乘淡出系数，彗发透明度乘淡出系数
        if (lodFade > 0.001) {
          // 尾部距离缩放
          const distScale = 0.08 + 0.92 * activity;
          comet.tailGroup.scale.setScalar(distScale * (0.3 + 0.7 * lodFade));

          // 彗发距离淡出
          const comaScale = 0.10 + 0.90 * activity;
          const breathScale = 0.90 + 0.10 * globalBreath;
          const fadeScale = 0.2 + 0.8 * lodFade;
          comet.coma.scale.set(
            comaScale * breathScale * fadeScale,
            comaScale * breathScale * fadeScale,
            comaScale * 1.35 * breathScale * fadeScale
          );

          // 尾部/彗发可见性：用透明度和缩放控制，不硬隐藏
          comet.coma.visible = true;
          comet.tailGroup.visible = true;

          // 传递 lodFade 到材质（在已有 uniforms 基础上额外调制透明度）
          for (const mesh of comet.tailMeshes) {
            const mat = mesh.userData?.material;
            if (mat?.uniforms) {
              mat.uniforms.uLodFade = mat.uniforms.uLodFade || { value: 1.0 };
              mat.uniforms.uLodFade.value = lodFade;
            }
          }
          if (comet.coma.userData?.material?.uniforms) {
            const u = comet.coma.userData.material.uniforms;
            u.uLodFade = u.uLodFade || { value: 1.0 };
            u.uLodFade.value = lodFade;
          }
          // 彗核辉光也受距离淡出影响
          comet.nucleus.traverse((child) => {
            if (child.userData?.material?.uniforms) {
              const u = child.userData.material.uniforms;
              u.uLodFade = u.uLodFade || { value: 1.0 };
              u.uLodFade.value = lodFade;
            }
          });
        } else {
          comet.coma.visible = false;
          comet.tailGroup.visible = false;
        }

        const close = camDist < CLOSE_PARTICLE_DIST;
        comet.closeParticles.visible = close;
        if (close) this._updateCloseParticles(comet.closeParticles, delta, activity, elapsed, globalBreath, burst);
      }
    }
  }

  // ==================== 更新近距离粒子（强化穿梭感）====================
  _updateCloseParticles(group, delta, activity, elapsed, globalBreath, burst) {
    const pd = group.userData.particleData;
    const pos = pd.positions;
    const sizes = pd.sizes;
    const colors = pd.colors;
    const maxR = pd.comaRadius * 1.2;

    for (let i = 0; i < pd.count; i++) {
      const idx = i * 3;

      // 尾部方向快速漂移（穿梭感强化）
      pos[idx + 2] += pd.speed * delta * activity * (0.8 + 0.6 * burst);

      // 横向扩散 — 大幅扩散，制造喷射感
      const distFromNucleus = Math.max(0, pos[idx + 2]);
      const t = distFromNucleus / maxR;
      const spread = t * 5.0;

      pos[idx] += Math.sin(pos[idx + 2] * 0.10 + i * 1.7 + elapsed * 0.4)
                  * spread * delta * 5.0 * burst;
      pos[idx + 1] += Math.cos(pos[idx + 2] * 0.08 + i * 2.3 + elapsed * 0.3)
                      * spread * delta * 4.0 * burst;

      // 粒子大小：越远越大 + 呼吸 + 爆发
      const breathFactor = 0.85 + 0.15 * globalBreath;
      sizes[i] = pd.nucleusRadius * (0.25 + t * 1.1) * breathFactor * (0.85 + 0.30 * burst);

      // 颜色：紫 → 蓝 → 青 → 白（更丰富的渐变）
      const mixT = Math.min(t, 1.0);
      colors[idx] = 0.45 * (1 - mixT) + 0.08 * mixT;
      colors[idx + 1] = 0.22 * (1 - mixT) + 0.45 * mixT;
      colors[idx + 2] = 0.70 * (1 - mixT) + 0.90 * mixT;

      // 超出范围重置
      if (pos[idx + 2] > maxR * 0.55 || pos[idx + 2] < -maxR * 0.5) {
        const theta = Math.PI * 0.20 + Math.random() * Math.PI * 0.50;
        const phi = Math.random() * Math.PI * 2;
        const r = pd.nucleusRadius * 1.0 + Math.random() * (Math.max(0.01, maxR * 0.35 - pd.nucleusRadius));
        pos[idx] = r * Math.sin(theta) * Math.cos(phi);
        pos[idx + 1] = r * Math.sin(theta) * Math.sin(phi) * 0.4;
        pos[idx + 2] = r * Math.cos(theta);
        sizes[i] = pd.nucleusRadius * (0.20 + Math.random() * 0.30);
        const cm = Math.random();
        colors[idx] = 0.35 + 0.30 * cm;
        colors[idx + 1] = 0.22 + 0.30 * (1 - cm);
        colors[idx + 2] = 0.65 + 0.30 * cm;
      }
    }

    const points = group.children[0];
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.size.needsUpdate = true;
    points.geometry.attributes.aColor.needsUpdate = true;

    const mat = group.userData.particleMat;
    if (mat && mat.uniforms) {
      mat.uniforms.uActivity.value = activity;
      mat.uniforms.uTime.value = elapsed;
      mat.uniforms.uGlobalBreath.value = globalBreath;
      mat.uniforms.uBurst.value = burst;
    }
  }

  dispose() {
    for (const comet of this.comets) {
      comet.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.comets = [];
    this._burstTimers = [];
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
