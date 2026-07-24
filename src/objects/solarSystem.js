/**
 * 太阳系系统
 * 太阳 + 8 大行星（含真实纹理）+ 卫星 + 土星环
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { fbm3D } from '../utils/noise.js'; // 仍用于卫星纹理生成
import { getPlanetTextures, loadAllPlanetTextures } from './planetTextures.js';
import { PlanetRingSystem } from './planetRings.js';

// v9.2: 轨道+大小按真实比例修正（兼顾可玩性）
const PLANET_DATA = [
  { name: 'Mercury', orbitRadius: 450,   radius: 8,    orbitPeriod: 88,     rotationPeriod: 58.6,  tilt: 0.03,  eccentricity: 0.21, color: '#8c7e6d' },
  { name: 'Venus',   orbitRadius: 750,   radius: 17,   orbitPeriod: 225,    rotationPeriod: -243,  tilt: 177.4,  eccentricity: 0.007, color: '#c8a44e' },
  { name: 'Earth',   orbitRadius: 1100,  radius: 20,   orbitPeriod: 365,    rotationPeriod: 1,     tilt: 23.4,   eccentricity: 0.017, color: '#2b5ea7' },
  { name: 'Mars',    orbitRadius: 1600,  radius: 11,   orbitPeriod: 687,    rotationPeriod: 1.03,  tilt: 25.2,   eccentricity: 0.093, color: '#c1440e' },
  { name: 'Jupiter', orbitRadius: 4000,  radius: 65,   orbitPeriod: 4333,   rotationPeriod: 0.41,  tilt: 3.1,    eccentricity: 0.049, color: '#c4a46a' },
  { name: 'Saturn',  orbitRadius: 6500,  radius: 55,   orbitPeriod: 10759,  rotationPeriod: 0.44,  tilt: 26.7,   eccentricity: 0.057, color: '#b8a060' },
  { name: 'Uranus',  orbitRadius: 9000,  radius: 28,   orbitPeriod: 30687,  rotationPeriod: -0.72, tilt: 97.8,   eccentricity: 0.046, color: '#7ec8c8' },
  { name: 'Neptune', orbitRadius: 12000, radius: 26,   orbitPeriod: 60190,  rotationPeriod: 0.67,  tilt: 28.3,   eccentricity: 0.010, color: '#3d5fc4' },
];

// ---- 卫星数据 ----
const MOON_DATA = {
  Earth: [
    { name: 'Moon', orbitRadius: 25, radius: 2.5, orbitPeriod: 27.3, color: '#888' },
  ],
  Jupiter: [
    { name: 'Io',       orbitRadius: 60, radius: 2.2, orbitPeriod: 1.77, color: '#c8b44a' },
    { name: 'Europa',   orbitRadius: 75, radius: 1.9, orbitPeriod: 3.55, color: '#a8b0b8' },
    { name: 'Ganymede', orbitRadius: 95, radius: 3.2, orbitPeriod: 7.15, color: '#9a8a70' },
    { name: 'Callisto', orbitRadius: 120, radius: 2.8, orbitPeriod: 16.7, color: '#6a6050' },
  ],
  Saturn: [
    { name: 'Titan',     orbitRadius: 70, radius: 3.0, orbitPeriod: 15.95, color: '#c8a050' },
    { name: 'Enceladus', orbitRadius: 45, radius: 1.5, orbitPeriod: 1.37,  color: '#e0e8f0' },
  ],
};

// 时间缩放：1 秒游戏时间 = 多少天
const TIME_SCALE = 30; // v9.3: 地球公转~12秒，肉眼可见
// 自转视觉倍率：自转也按 TIME_SCALE 换算，但全速会过快（地球每秒30圈会糊），故整体降速到"可见不晕"
const ROT_SCALE = 0.08;

export class SolarSystem {
  constructor() {
    this.group = new THREE.Group();
    this.sun = null;
    this.planets = [];     // { group, data, orbitPivot, moons[] }
    this.ringSystem = new PlanetRingSystem();
    this.sunMaterial = null;
    this.camera = null;
    this._hud = null;
    this._tempVec = new THREE.Vector3();
    this._ssWorldPos = new THREE.Vector3(); // v30: 太阳系世界坐标（轨道线距离淡出）
    this._textures = null; // v9.0: 纹理缓存
    this._ownTextures = []; // v9.0-fix: 本实例创建的纹理（环/标签），dispose 时释放；行星共享纹理由 planetTextures 缓存管理
  }

  async init(scene, camera) {
    this.camera = camera;
    const cfg = config.solarSystem;

    // v9.0: 先加载纹理
    this._textures = await loadAllPlanetTextures();

    // 太阳
    this.createSun(cfg);

    // 行星 + 卫星
    PLANET_DATA.forEach((pData) => {
      this.createPlanet(pData, cfg);
    });

    this.createAsteroidBelt();
    this.createSunFlares(cfg);

    scene.add(this.group);
    console.log('[SolarSystem] v9.0 PBR纹理太阳系初始化完成');
  }

  setCamera(camera) {
    this.camera = camera;
  }
  setHUD(hud) { this._hud = hud; }

  // ==================== 太阳 ====================

  createSun(cfg) {
    const sunGeo = new THREE.SphereGeometry(cfg.sunRadius, 64, 64);

    // v9.0: 使用真实太阳纹理 + MeshBasicMaterial (不参与光照)
    const tex = this._textures?.get('Sun');
    const sunTex = tex?.map || null;
    this.sunMaterial = new THREE.MeshBasicMaterial({
      map: sunTex,
      color: sunTex ? 0xffffff : 0xfff8e8, // v22: 有纹理=纯白, 无纹理=偏白
    });

    this.sun = new THREE.Mesh(sunGeo, this.sunMaterial);
    this.group.add(this.sun);

    // 太阳点光源
    // decay=0 无距离衰减 — 艺术化太阳系，所有轨道行星亮度均匀
    // 不用物理衰减(decay=2)因为1100单位外光照≈0，纹理全黑
    const sunLight = new THREE.PointLight(0xfff5e0, cfg.sunLightIntensity || 5.0, cfg.sunLightRange || 25000);
    sunLight.decay = 0;
    sunLight.position.set(0, 0, 0);
    this.group.add(sunLight);

    // v29-fix: 外层弥散光晕放大至 3.6 倍，边缘平滑羽化
    const glowGeo = new THREE.SphereGeometry(cfg.sunRadius * 3.6, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vNormal; varying vec3 vWorldPos; varying float vCamDist; varying float vRadius; void main() { vNormal = normalize(normalMatrix * normal); vWorldPos = (modelMatrix * vec4(position,1.0)).xyz; vec3 center = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz; vCamDist = length(cameraPosition - center); vRadius = length(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal; varying vec3 vWorldPos; varying float vCamDist; varying float vRadius; uniform float uTime;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        float noise(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main() {
          float rim = 1.0 - max(0.0, dot(normalize(vNormal), vec3(0,0,1)));
          // v29-fix: (1.0-rim) 确保几何边缘处 alpha=0，消除硬边界
          float alpha = pow(1.0 - rim, 3.2) * 0.85;
          float n = noise(vWorldPos * 0.01 + uTime * 0.03) * 0.15;
          float total = alpha * (1.0 + n);
          float camFade = smoothstep(vRadius * 0.7, vRadius * 1.3, vCamDist);
          total *= camFade;
          vec3 c = mix(vec3(1.0, 1.0, 0.9), vec3(1.0, 0.75, 0.3), smoothstep(0.1, 0.6, rim));
          c = mix(c, vec3(0.8, 0.35, 0.08), smoothstep(0.5, 1.0, rim));
          gl_FragColor = vec4(c * total * 1.2, total * 0.65);
        }
      `,
      // v29-fix: CustomBlending 锁定 Alpha 通道 — RGB 加法混合 + Alpha 拒绝写入
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    this.glowMaterial = glowMat;
    this.group.add(new THREE.Mesh(glowGeo, glowMat));

    // v29-fix: 内层日冕缩至 2.4 倍，边缘归零 + 湍流噪声
    const coronaGeo = new THREE.SphereGeometry(cfg.sunRadius * 2.4, 32, 32);
    this.coronaMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vCamDist;
        varying float vRadius;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vCamDist = length(cameraPosition - center);
          vRadius = length(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vCamDist;
        varying float vRadius;
        uniform float uTime;

        // Simplex 3D noise
        vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
        vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
        float snoise(vec3 v){
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod(i, 289.0);
          vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 1.0/7.0;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          float rim = 1.0 - max(0.0, dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
          // v29-fix: pow(1.0-rim, 2.4) — 靠近日轮表面最强，向外至边界平滑归零
          float intensity = pow(1.0 - rim, 2.4);
          float pulse = 0.75 + sin(uTime * 0.5) * 0.15 + sin(uTime * 1.7) * 0.1;
          // 3层 FBM 湍流
          float n1 = snoise(vWorldPos * 0.035 + uTime * 0.06) * 0.5 + 0.5;
          float n2 = snoise(vWorldPos * 0.09 + uTime * 0.12) * 0.5 + 0.5;
          float n3 = snoise(vWorldPos * 0.22 + uTime * 0.22) * 0.5 + 0.5;
          float granMix = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
          vec3 c = mix(vec3(1.0, 0.98, 0.75), vec3(1.0, 0.50, 0.10), granMix);
          c = mix(c, vec3(0.75, 0.15, 0.02), rim);
          float camFade = smoothstep(vRadius * 0.7, vRadius * 1.3, vCamDist);
          gl_FragColor = vec4(c * intensity * 1.5, intensity * 0.55 * pulse * camFade);
        }
      `,
      // v29-fix: CustomBlending 锁定 Alpha 通道 — RGB 加法混合 + Alpha 拒绝写入
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    this.group.add(new THREE.Mesh(coronaGeo, this.coronaMaterial));
  }

  // ==================== 行星 ====================

  createPlanet(pData) {
    const orbitPivot = new THREE.Group();
    const planetGroup = new THREE.Group();
    planetGroup.position.x = pData.orbitRadius;
    const tiltRad = (pData.tilt * Math.PI) / 180;
    planetGroup.rotation.z = tiltRad;

    // v9.0: PBR材质 — 加载真实纹理
    const tex = this._textures?.get(pData.name);
    const isRocky = ['Mercury', 'Venus', 'Earth', 'Mars'].includes(pData.name);
    const isGas = ['Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(pData.name);

    const matOpts = {
      map: tex?.map || null,
      normalMap: tex?.normalMap || null,
      roughnessMap: tex?.roughnessMap || null,
      roughness: isGas ? 0.35 : 0.5,
      metalness: 0.05,
      color: tex?.map ? 0xffffff : new THREE.Color(pData.color),
      // emissive 仅作暗面防死黑用，强度极低以免冲淡纹理
      emissive: new THREE.Color(0x111111),
      emissiveIntensity: 0.3,
    };
    // v15: 火星偏红 emissive（比基础稍亮）
    if (pData.name === 'Mars') {
      matOpts.emissive = new THREE.Color(0x110800);
      matOpts.emissiveIntensity = 0.15;
    }

    // fix: 移除 displacementMap 误用 normalMap（程序化法线当位移会让球面变"麻子"、扭曲 UV 纹理）
    const material = new THREE.MeshStandardMaterial(matOpts);

    const segments = pData.radius > 20 ? 64 : 32;
    const geometry = new THREE.SphereGeometry(pData.radius, segments, segments);
    const mesh = new THREE.Mesh(geometry, material);
    planetGroup.add(mesh);

    // v19.5: 行星名字标签 (带环行星留更多空间)
    const hasRings = (pData.name === 'Saturn');
    const labelSprite = this.createNameLabel(pData.name, pData.radius, hasRings);
    planetGroup.add(labelSprite);

    // 特化行星细节
    if (pData.name === 'Earth') {
      // 云层球体 (独立自转)
      if (tex?.cloudMap) {
        const cloudGeo = new THREE.SphereGeometry(pData.radius * 1.02, 32, 32);
        const cloudMat = new THREE.MeshStandardMaterial({
          map: tex.cloudMap,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          roughness: 1.0,
          metalness: 0,
        });
        const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        cloudMesh.userData.isCloud = true;
        planetGroup.add(cloudMesh);
      }
      // 大气层菲涅尔辉光
      this.addFresnelAtmosphere(planetGroup, pData.radius, new THREE.Color(0.3, 0.5, 1.0));
    } else if (pData.name === 'Venus') {
      // v15: 金星浓密大气 (偏橙黄)
      this.addFresnelAtmosphere(planetGroup, pData.radius, new THREE.Color(0.9, 0.75, 0.3));
    } else if (isGas) {
      this.addFresnelAtmosphere(planetGroup, pData.radius,
        new THREE.Color(pData.color).multiplyScalar(0.6));
    }
    // v15: 天王星/海王星大气
    if (pData.name === 'Uranus') {
      this.addFresnelAtmosphere(planetGroup, pData.radius, new THREE.Color(0.4, 0.8, 0.8));
    }
    if (pData.name === 'Neptune') {
      this.addFresnelAtmosphere(planetGroup, pData.radius, new THREE.Color(0.3, 0.4, 1.0));
    }

    // v-latest: 碎石环 — 仅气态巨行星（天文事实：只有木星/土星/天王星/海王星有环）
    // 土星/天王星已有专业环，只为木星和海王星添加稀疏碎石环
    if (config.planetRings?.enabled && (pData.name === 'Jupiter' || pData.name === 'Neptune')) {
      // 木星大（r=65）→ 粒子多；海王星小（r=26）→ 粒子少，自动按比例缩放
      this.ringSystem.addRing(planetGroup, pData.radius);
    }

    // 土星环（保留原有专业环）
    if (pData.name === 'Saturn') {
      const ring = this.createSaturnRing(pData.radius);
      planetGroup.add(ring);
    }
    if (pData.name === 'Uranus') {
      const ring = this.createUranusRing(pData.radius);
      planetGroup.add(ring);
    }

    // 轨道线
    const orbitLine = this.createOrbitLine(pData.orbitRadius);
    orbitPivot.add(orbitLine);
    orbitPivot.add(planetGroup);

    // 卫星
    const moons = [];
    const moonList = MOON_DATA[pData.name] || [];
    moonList.forEach((mData) => {
      const moon = this.createMoon(mData);
      planetGroup.add(moon);
      moons.push({ group: moon, data: mData, angle: Math.random() * Math.PI * 2 });
    });

    this.group.add(orbitPivot);

    const texStatus = tex ? (tex.map ? '纹理OK' : '无纹理') : '未加载';
    // v25: 诊断日志（仅首次创建时输出，避免刷屏）
    if (pData.name === 'Earth' || pData.name === 'Mars') {
      console.log(`[SolarSystem] ${pData.name} 状态:`, texStatus,
        '| map:', tex?.map ? `存在(尺寸=${tex.map.image?.width}x${tex.map.image?.height})` : 'null',
        '| normalMap:', tex?.normalMap ? 'OK' : 'null',
        '| URL:', tex?.map?.image?.src || 'N/A');
    }

    this.planets.push({
      group: planetGroup, orbitPivot, orbitLine, data: pData, mesh, material, moons,
      labelSprite,  // v25: 标签引用用于距离剔除
      angle: Math.random() * Math.PI * 2, rotAngle: 0,
    });
  }

  // ==================== 卫星 ====================

  createMoon(mData) {
    const moonPivot = new THREE.Group();
    const moonColor = new THREE.Color(mData.color);
    const material = new THREE.MeshStandardMaterial({
      color: moonColor,
      roughness: 0.9,
      metalness: 0.05,
    });
    const geometry = new THREE.SphereGeometry(mData.radius, 16, 16);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = mData.orbitRadius;
    moonPivot.add(mesh);
    return moonPivot;
  }

  /** v13: Rayleigh散射大气层 (Space Engine风格) */
  addFresnelAtmosphere(group, radius, color) {
    const atmGeo = new THREE.SphereGeometry(radius * 1.15, 32, 32);
    const atmMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uSunPos: { value: new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vCamDist;
        varying float vRadius;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vCamDist = length(cameraPosition - center);
          vRadius = length(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        uniform vec3 uColor;
        uniform vec3 uSunPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 lightDir = normalize(uSunPos - vWorldPos);
          float sunAlign = max(0.0, dot(vNormal, lightDir));
          float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
          vec3 scatterColor = uColor * (0.35 + sunAlign * 0.9);
          float rimPow = pow(rim, 2.8);
          float thickness = rimPow * (0.25 + sunAlign * 0.45);
          gl_FragColor = vec4(scatterColor, thickness * 0.45);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(atmGeo, atmMat));
  }

  // ==================== 土星环 ====================

  createSaturnRing(planetRadius) {
    const innerR = planetRadius * 1.2;
    const outerR = planetRadius * 2.5;
    const geometry = new THREE.RingGeometry(innerR, outerR, 128);

    // 程序化环纹理（含卡西尼缝）
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
    // 从内到外：C环(暗) → B环(亮) → 卡西尼缝 → A环 → 外缘
    gradient.addColorStop(0.0,  'rgba(140,120,90, 0.1)');   // C环
    gradient.addColorStop(0.1,  'rgba(180,160,120, 0.4)');
    gradient.addColorStop(0.2,  'rgba(200,180,140, 0.8)');  // B环
    gradient.addColorStop(0.38, 'rgba(210,190,150, 0.9)');
    gradient.addColorStop(0.42, 'rgba(50,40,30, 0.05)');    // 卡西尼缝
    gradient.addColorStop(0.48, 'rgba(50,40,30, 0.05)');
    gradient.addColorStop(0.52, 'rgba(190,170,130, 0.7)');  // A环
    gradient.addColorStop(0.7,  'rgba(180,160,120, 0.5)');
    gradient.addColorStop(0.85, 'rgba(160,140,100, 0.2)');
    gradient.addColorStop(1.0,  'rgba(140,120,90, 0.0)');   // 外缘

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 64);

    // 细微噪点纹理
    const imageData = ctx.getImageData(0, 0, 1024, 64);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 15;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this._ownTextures.push(texture); // 跟踪本实例纹理，dispose 时释放

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI * 0.5;
    return ring;
  }

  createUranusRing(planetRadius) {
    const innerR = planetRadius * 1.5;
    const outerR = planetRadius * 2.0;
    const geometry = new THREE.RingGeometry(innerR, outerR, 64);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, 'rgba(150,200,200, 0.0)');
    gradient.addColorStop(0.2, 'rgba(150,200,200, 0.3)');
    gradient.addColorStop(0.5, 'rgba(150,200,200, 0.15)');
    gradient.addColorStop(0.8, 'rgba(150,200,200, 0.3)');
    gradient.addColorStop(1, 'rgba(150,200,200, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 16);

    const texture = new THREE.CanvasTexture(canvas);
    this._ownTextures.push(texture); // 跟踪本实例纹理，dispose 时释放
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI * 0.5 + 0.15; // 略有倾斜
    return ring;
  }

  // ==================== 轨道线 ====================

  createOrbitLine(radius) {
    const segments = 128;
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // v30: 改用虚线材质 — 星舰导航全息投影质感
    const material = new THREE.LineDashedMaterial({
      color: 0x4488aa,
      transparent: true,
      opacity: 0.25,
      dashSize: 25,
      gapSize: 18,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances(); // 虚线必须调用
    return line;
  }

  // ==================== 小行星带（v8.0）====================

  createAsteroidBelt() {
    const count = 600;
    const innerR = 2000;  // 火星轨道(1600)之后
    const outerR = 3500;  // 木星轨道(4000)之前
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = innerR + Math.random() * (outerR - innerR);
      // 微小的Y轴偏移模拟带厚度
      const yOffset = (Math.random() - 0.5) * 40;

      positions[i3] = Math.cos(angle) * radius;
      positions[i3 + 1] = yOffset;
      positions[i3 + 2] = Math.sin(angle) * radius;

      const brightness = 0.3 + Math.random() * 0.3;
      colors[i3] = brightness;
      colors[i3 + 1] = brightness * 0.85;
      colors[i3 + 2] = brightness * 0.7;

      sizes[i] = 0.3 + Math.random() * 1.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const belt = new THREE.Points(geo, mat);
    belt.userData.isAsteroidBelt = true;
    // 添加到 group 让其跟随太阳系整体
    const beltPivot = new THREE.Group();
    beltPivot.add(belt);
    this.group.add(beltPivot);

    this.asteroidBelt = { points: belt, pivot: beltPivot };

    console.log('[SolarSystem] 小行星带初始化完成，粒子数:', count);
  }

  // ==================== 太阳耀斑粒子（v8.0）====================

  createSunFlares(cfg) {
    const flareCount = 200;
    const positions = new Float32Array(flareCount * 3);
    const sizes = new Float32Array(flareCount);

    for (let i = 0; i < flareCount; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // 分布在太阳表面外不远处
      const r = cfg.sunRadius * (1.0 + Math.random() * 0.4);

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      sizes[i] = 1.5 + Math.random() * 3.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 2.0,
      color: 0xfff8e8,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const flares = new THREE.Points(geo, mat);
    flares.userData.isSunFlares = true;
    this.group.add(flares);
    this.sunFlares = { points: flares, material: mat };
  }

  /** v19.5: 行星名字标签 — 描边轮廓 + 半透明背景，确保可读性 */
  createNameLabel(name, radius, hasRings = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // 半透明深色背景 pill
    ctx.font = 'bold 48px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(name);
    const tw = metrics.width;
    const padX = 20, padY = 12;
    const rx = 256 - tw / 2 - padX;
    const ry = 64 - 24 - padY;
    const rw = tw + padX * 2;
    const rh = 48 + padY * 2;
    const cr = 16;
    // 圆角矩形
    ctx.fillStyle = 'rgba(0, 0, 10, 0.5)';
    ctx.beginPath();
    ctx.moveTo(rx + cr, ry);
    ctx.lineTo(rx + rw - cr, ry);
    ctx.arcTo(rx + rw, ry, rx + rw, ry + cr, cr);
    ctx.lineTo(rx + rw, ry + rh - cr);
    ctx.arcTo(rx + rw, ry + rh, rx + rw - cr, ry + rh, cr);
    ctx.lineTo(rx + cr, ry + rh);
    ctx.arcTo(rx, ry + rh, rx, ry + rh - cr, cr);
    ctx.lineTo(rx, ry + cr);
    ctx.arcTo(rx, ry, rx + cr, ry, cr);
    ctx.fill();

    // 文字描边
    ctx.strokeStyle = 'rgba(0, 0, 10, 0.8)';
    ctx.lineWidth = 5;
    ctx.strokeText(name, 256, 64);
    // 主填充
    ctx.fillStyle = 'rgba(220, 235, 255, 0.95)';
    ctx.fillText(name, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    this._ownTextures.push(texture);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(spriteMat);
    const offsetMult = hasRings ? 3.2 : 2.6;
    sprite.position.y = radius * offsetMult + 8;
    sprite.scale.set(radius * 3.0, radius * 3.0 * 0.25, 1);
    return sprite;
  }

  // ==================== 更新 ====================

  update(delta, elapsed) {
    // 日冕动画
    if (this.coronaMaterial) {
      this.coronaMaterial.uniforms.uTime.value = elapsed;
    }
    // v15: 光晕动画
    if (this.glowMaterial) {
      this.glowMaterial.uniforms.uTime.value = elapsed;
    }
    // v13: 更新大气层太阳位置
    if (this.sun) this.sun.getWorldPosition(this._ssWorldPos);
    this.planets.forEach(planet => {
      planet.group.traverse(child => {
        if (child.material?.uniforms?.uSunPos) {
          child.material.uniforms.uSunPos.value.copy(this._ssWorldPos);
        }
      });
    });
    // v-latest: 更新行星碎石环
    this.ringSystem.update(delta);

    // 小行星带
    if (this.asteroidBelt && this.asteroidBelt.pivot) {
      this.asteroidBelt.pivot.rotation.y += delta * 0.02;
    }
    // 太阳耀斑
    if (this.sunFlares && this.sunFlares.material) {
      this.sunFlares.material.opacity = 0.35 + Math.sin(elapsed * 2.5) * 0.2;
    }

    // 行星
    this.planets.forEach((planet) => {
      const d = planet.data;
      const orbitSpeed = (2 * Math.PI) / (d.orbitPeriod / TIME_SCALE);
      planet.angle += orbitSpeed * delta;
      planet.orbitPivot.rotation.y = planet.angle;

      // fix: 自转时间基准与公转统一（除以 TIME_SCALE），再乘 ROT_SCALE 降到"可见不晕"
      const rotSpeed = (2 * Math.PI) / (Math.abs(d.rotationPeriod) / TIME_SCALE);
      planet.rotAngle += rotSpeed * delta * Math.sign(d.rotationPeriod) * ROT_SCALE;
      planet.mesh.rotation.y = planet.rotAngle;

      // v9.0: 地球云层独立自转
      if (d.name === 'Earth') {
        planet.group.children.forEach(child => {
          if (child.userData && child.userData.isCloud) {
            child.rotation.y += delta * 0.03;
          }
        });
      }

      // v25: 标签距离剔除 — 太近（贴脸）或太远（看不清）都隐藏
      const camPos = this.camera?.position;
      if (camPos && planet.labelSprite) {
        planet.group.getWorldPosition(this._tempVec);
        const dist = camPos.distanceTo(this._tempVec);
        const minDist = d.radius * 4;
        const maxDist = config.solarSystem?.labelMaxDistance ?? 6000;
        planet.labelSprite.visible = dist > minDist && dist < maxDist;
      }

      // v30: 轨道线距离淡出 — 相机远离太阳系时渐变消失
      if (camPos && planet.orbitLine) {
        this.group.getWorldPosition(this._ssWorldPos);
        const distToSys = camPos.distanceTo(this._ssWorldPos);
        const fadeIn = 8000;
        const fadeOut = 18000;
        const t = 1 - Math.min(1, Math.max(0, (distToSys - fadeIn) / (fadeOut - fadeIn)));
        planet.orbitLine.material.opacity = t * 0.25;
        planet.orbitLine.visible = t > 0.01;
      }

      // 卫星
      planet.moons.forEach((moon) => {
        const moonSpeed = (2 * Math.PI) / (moon.data.orbitPeriod / TIME_SCALE);
        moon.angle += moonSpeed * delta;
        moon.group.rotation.y = moon.angle;
      });
    });

    // v19.5: 靠近行星时显示信息面板
    this._updateProximityInfo();
  }

  /** v19.5: 检测玩家是否靠近行星，显示描述信息 */
  _updateProximityInfo() {
    if (!this.camera) return;
    if (!this._hud) return;

    let closest = null;
    let closestDist = Infinity;

    this.planets.forEach((planet) => {
      planet.group.getWorldPosition(this._tempVec);
      const dist = this.camera.position.distanceTo(this._tempVec) - planet.data.radius;
      const threshold = planet.data.radius * 5 + 80;
      if (dist < threshold && dist < closestDist) {
        closestDist = dist;
        closest = planet;
      }
    });

    if (closest) {
      const d = closest.data;
      const planetTypes = {
        'Mercury': 'Rocky Planet — 太阳系最内层',
        'Venus': 'Rocky Planet — 浓密大气层',
        'Earth': 'Rocky Planet — 我们的家园',
        'Mars': 'Rocky Planet — 红色星球',
        'Jupiter': 'Gas Giant — 太阳系最大行星',
        'Saturn': 'Gas Giant — 壮丽环系统',
        'Uranus': 'Ice Giant — 侧躺的行星',
        'Neptune': 'Ice Giant — 太阳系最外层',
      };
      this._hud.showCelestialInfo(d.name, planetTypes[d.name] || 'Planet', [
        `半径: ${d.radius}`, `距离: ${closestDist.toFixed(0)}`,
        `公转周期: ${d.orbitPeriod} 天`,
      ].join('<br>'));
    } else {
      this._hud.hideCelestialInfo();
    }
  }

  // ==================== 纹理生成 ====================

  /**
   * v8.1: 生成颜色贴图 + 凹凸贴图 + 粗糙度贴图
   */
  generatePlanetTexture(name) {
    const w = 512, h = 256;
    const bw = 256, bh = 128; // 凹凸贴图半分辨率即可

    // 颜色画布
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    // 凹凸画布
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = bw;
    bumpCanvas.height = bh;
    const bumpCtx = bumpCanvas.getContext('2d');
    const bumpImageData = bumpCtx.createImageData(bw, bh);
    const bumpData = bumpImageData.data;

    // 粗糙度画布（仅地球等类地行星需要）
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = bw;
    roughCanvas.height = bh;
    const roughCtx = roughCanvas.getContext('2d');
    const roughImageData = roughCtx.createImageData(bw, bh);
    const roughData = roughImageData.data;

    const scaleX = bw / w;
    const scaleY = bh / h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const lon = u * Math.PI * 2;
        const lat = v * Math.PI;
        const sx = Math.sin(lat) * Math.cos(lon);
        const sy = Math.cos(lat);
        const sz = Math.sin(lat) * Math.sin(lon);

        const result = this.samplePlanetData(name, u, v, sx, sy, sz);
        const [r, g, b] = result.color;
        const height = result.height != null ? result.height : 0.5;
        const roughness = result.roughness != null ? result.roughness : 0.7;

        // 写入颜色
        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;

        // 写入凹凸（半分辨率）
        const bx = Math.floor(x * scaleX);
        const by = Math.floor(y * scaleY);
        const bidx = (by * bw + bx) * 4;
        const bumpVal = Math.round(height * 255);
        bumpData[bidx] = bumpVal;
        bumpData[bidx + 1] = bumpVal;
        bumpData[bidx + 2] = bumpVal;
        bumpData[bidx + 3] = 255;

        // 写入粗糙度
        const roughVal = Math.round(roughness * 255);
        roughData[bidx] = roughVal;
        roughData[bidx + 1] = roughVal;
        roughData[bidx + 2] = roughVal;
        roughData[bidx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    bumpCtx.putImageData(bumpImageData, 0, 0);
    roughCtx.putImageData(roughImageData, 0, 0);

    const colorTex = new THREE.CanvasTexture(canvas);
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.ClampToEdgeWrapping;

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.ClampToEdgeWrapping;

    const roughTex = new THREE.CanvasTexture(roughCanvas);
    roughTex.wrapS = THREE.RepeatWrapping;
    roughTex.wrapT = THREE.ClampToEdgeWrapping;

    return { map: colorTex, bumpMap: bumpTex, roughnessMap: roughTex, hasBump: true };
  }

  /**
   * v8.1: 采样行星数据（颜色 + 高度 + 粗糙度）
   */
  samplePlanetData(name, u, v, sx, sy, sz) {
    switch (name) {
      case 'Mercury': return this._mercury(u, v, sx, sy, sz);
      case 'Venus':   return this._venus(u, v, sx, sy, sz);
      case 'Earth':   return this._earth(u, v, sx, sy, sz);
      case 'Mars':    return this._mars(u, v, sx, sy, sz);
      case 'Jupiter': return this._jupiter(u, v, sx, sy, sz);
      case 'Saturn':  return this._saturn(u, v, sx, sy, sz);
      case 'Uranus':  return this._uranus(u, v, sx, sy, sz);
      case 'Neptune': return this._neptune(u, v, sx, sy, sz);
      default:        return { color: [128, 128, 128], height: 0.5, roughness: 0.8 };
    }
  }

  samplePlanetColor(name, u, v, sx, sy, sz) {
    return this.samplePlanetData(name, u, v, sx, sy, sz).color;
  }

  // ---- 水星：灰色，密布陨石坑 ----
  _mercury(u, v, sx, sy, sz) {
    const base = 110 + fbm3D(sx * 4, sy * 4, sz * 4, 5) * 50;
    const crater = fbm3D(sx * 12, sy * 12, sz * 12, 4);
    const craterEdge = Math.abs(crater - 0.5) < 0.03 ? -30 : 0;
    const craterFloor = crater > 0.6 ? -15 : 0;
    const v2 = Math.max(60, Math.min(200, base + craterEdge + craterFloor));
    const h = 0.2 + (v2 / 200) * 0.5 + (Math.abs(crater - 0.5) < 0.03 ? 0.25 : 0);
    return { color: [v2, v2 * 0.95, v2 * 0.9], height: h, roughness: 0.7 };
  }

  // ---- 金星：黄白色大气云纹 ----
  _venus(u, v, sx, sy, sz) {
    const n1 = fbm3D(sx * 3 + 10, sy * 3, sz * 3, 5);
    const n2 = fbm3D(sx * 6 + 20, sy * 6, sz * 6, 4);
    const swirl = fbm3D(sx * 2 + n1 * 2, sy * 2 + n2 * 2, sz * 2, 4);
    const base = 180 + swirl * 60;
    return {
      color: [Math.min(255, base + 10), Math.min(255, base * 0.88), Math.min(255, base * 0.55)],
      height: 0.3 + swirl * 0.5,
      roughness: 0.4
    };
  }

  // ---- 地球：海洋 + 大陆 + 冰盖 + 云层 + 凹凸 ----
  _earth(u, v, sx, sy, sz) {
    const continent = fbm3D(sx * 2.5, sy * 2.5, sz * 2.5, 6, 2.0, 0.55);
    const detail = fbm3D(sx * 8, sy * 8, sz * 8, 4) * 0.15;
    const height = continent + detail;
    const polar = Math.abs(sy);
    const iceCap = polar > 0.75 ? (polar - 0.75) / 0.25 : 0;

    let r, g, b, roughness;

    if (height < 0.42) {
      const depth = (0.42 - height) / 0.42;
      r = 20 + depth * 10; g = 50 + (1 - depth) * 40; b = 140 + (1 - depth) * 60;
      if (height > 0.38) { r += 20; g += 30; b -= 20; }
      roughness = 0.1 + depth * 0.15;
    } else if (height < 0.44) {
      r = 190 + Math.random() * 20; g = 175 + Math.random() * 15; b = 120 + Math.random() * 20;
      roughness = 0.35;
    } else {
      const landN = fbm3D(sx * 5 + 50, sy * 5, sz * 5, 4);
      if (height < 0.55) { r = 40 + landN * 30; g = 80 + landN * 80; b = 25 + landN * 15; roughness = 0.55; }
      else if (height < 0.65) { r = 100 + landN * 40; g = 85 + landN * 30; b = 50 + landN * 20; roughness = 0.65; }
      else { const m = Math.min(255, 140 + landN * 60); r = m; g = m * 0.9; b = m * 0.8; roughness = 0.8; }
    }

    if (iceCap > 0) {
      r = Math.min(255, r + iceCap * (255 - r) * 0.8);
      g = Math.min(255, g + iceCap * (255 - g) * 0.7);
      b = Math.min(255, b + iceCap * (255 - b) * 0.5);
      roughness = roughness * (1 - iceCap * 0.7);
    }

    // 云层叠加（白色噪点）
    const cloud = fbm3D(sx * 6 + 42, sy * 6, sz * 6, 3);
    if (cloud > 0.55 && height > 0.3) {
      const ca = (cloud - 0.55) / 0.45 * 0.25;
      r = Math.min(255, r + ca * (255 - r));
      g = Math.min(255, g + ca * (255 - g));
      b = Math.min(255, b + ca * (255 - b));
    }

    return { color: [r, g, b], height: Math.min(1, height), roughness };
  }

  // ---- 火星：红褐色 + 极冠 + 凹凸 ----
  _mars(u, v, sx, sy, sz) {
    const base = fbm3D(sx * 3, sy * 3, sz * 3, 5);
    const detail = fbm3D(sx * 10, sy * 10, sz * 10, 4) * 0.2;
    const height = base + detail;
    const polar = Math.abs(sy);
    if (polar > 0.82) {
      const ice = (polar - 0.82) / 0.18;
      const v2 = 180 + ice * 70;
      return { color: [v2, v2, v2 + 5], height: 0.9, roughness: 0.08 };
    }
    const r = 150 + height * 70;
    const g = 80 + height * 40;
    const b = 40 + height * 25;
    const dark = fbm3D(sx * 6 + 30, sy * 6, sz * 6, 3);
    const rough = 0.5 + height * 0.4;
    if (dark > 0.6) return { color: [r * 0.7, g * 0.7, b * 0.7], height: height * 0.8, roughness: rough };
    return { color: [r, g, b], height, roughness: rough };
  }

  // ---- 木星：横向条带 + 大红斑 + 凹凸 ----
  _jupiter(u, v, sx, sy, sz) {
    const lat = sy;
    const bands = Math.sin(lat * 18) * 0.5 + 0.5;
    const bandWarp = fbm3D(sx * 4, sy * 1.5, sz * 4, 3) * 0.3;
    const bandVal = bands + bandWarp;

    let r, g, b;
    if (bandVal > 0.6) { r = 210; g = 185; b = 140; }
    else if (bandVal > 0.4) { r = 185; g = 150; b = 100; }
    else { r = 150; g = 115; b = 75; }

    const turb = fbm3D(sx * 8, sy * 3, sz * 8, 4);
    r += (turb - 0.5) * 30; g += (turb - 0.5) * 25; b += (turb - 0.5) * 20;

    const spotU = 0.65, spotV = 0.55;
    const spotLon = (u - spotU) * 8;
    const spotLat = (v - spotV) * 16;
    const spotDist = Math.sqrt(spotLon * spotLon + spotLat * spotLat);
    if (spotDist < 1.0) {
      const sb = 1 - spotDist;
      r = r + (190 - r) * sb * 0.7;
      g = g + (80 - g) * sb * 0.6;
      b = b + (60 - b) * sb * 0.5;
    }

    const height = 0.3 + bandVal * 0.5 + turb * 0.2;
    const rough = 0.25 + Math.abs(bandVal - 0.5) * 0.3;

    return {
      color: [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))],
      height, roughness: rough
    };
  }

  // ---- 土星：米黄色条带 + 凹凸 ----
  _saturn(u, v, sx, sy, sz) {
    const lat = sy;
    const bands = Math.sin(lat * 14) * 0.5 + 0.5;
    const warp = fbm3D(sx * 3, sy * 1, sz * 3, 3) * 0.2;
    const bandVal = bands + warp;

    let r = 190 + bandVal * 30;
    let g = 170 + bandVal * 25;
    let b = 120 + bandVal * 20;

    const detail = fbm3D(sx * 10, sy * 4, sz * 10, 3);
    r += (detail - 0.5) * 20; g += (detail - 0.5) * 18; b += (detail - 0.5) * 15;

    const height = 0.35 + bandVal * 0.4;
    const rough = 0.3 + Math.abs(bandVal - 0.5) * 0.25;

    return {
      color: [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))],
      height, roughness: rough
    };
  }

  // ---- 天王星：淡蓝绿色 + 微凹凸 ----
  _uranus(u, v, sx, sy, sz) {
    const n = fbm3D(sx * 4, sy * 4, sz * 4, 4);
    const band = Math.sin(sy * 6) * 0.03;
    return {
      color: [Math.min(255, 120 + n * 25 + band * 20), Math.min(255, 195 + n * 20 + band * 15), Math.min(255, 195 + n * 20 + band * 10)],
      height: 0.4 + n * 0.3,
      roughness: 0.4
    };
  }

  // ---- 海王星：深蓝色条带 + 凹凸 ----
  _neptune(u, v, sx, sy, sz) {
    const lat = sy;
    const bands = Math.sin(lat * 10) * 0.5 + 0.5;
    const warp = fbm3D(sx * 3, sy * 2, sz * 3, 3) * 0.15;

    let r = 50 + (bands + warp) * 20;
    let g = 70 + (bands + warp) * 25;
    let b = 160 + (bands + warp) * 40;

    const spot = fbm3D(sx * 6 + 40, sy * 6, sz * 6, 3);
    if (spot > 0.65) { r *= 0.7; g *= 0.7; b *= 0.85; }

    const height = 0.3 + (bands + warp) * 0.4;
    const rough = 0.3 + Math.abs(spot - 0.5) * 0.2;

    return {
      color: [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))],
      height, roughness: rough
    };
  }

  // ==================== 卫星纹理 ====================

  generateMoonTexture(name) {
    const w = 256, h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const lon = u * Math.PI * 2;
        const lat = v * Math.PI;
        const sx = Math.sin(lat) * Math.cos(lon);
        const sy = Math.cos(lat);
        const sz = Math.sin(lat) * Math.sin(lon);

        let r, g, b;
        switch (name) {
          case 'Moon': {
            const base = 120 + fbm3D(sx * 6, sy * 6, sz * 6, 4) * 50;
            const crater = fbm3D(sx * 15, sy * 15, sz * 15, 3);
            const edge = Math.abs(crater - 0.5) < 0.02 ? -25 : 0;
            const floor = crater > 0.6 ? -10 : 0;
            const v2 = Math.max(70, base + edge + floor);
            r = v2; g = v2 * 0.97; b = v2 * 0.93;
            break;
          }
          case 'Io': {
            const n = fbm3D(sx * 5, sy * 5, sz * 5, 5);
            const sulfur = fbm3D(sx * 10, sy * 10, sz * 10, 3);
            r = 180 + n * 60 + (sulfur > 0.6 ? 30 : 0);
            g = 160 + n * 40 - (sulfur > 0.6 ? 20 : 0);
            b = 60 + n * 30;
            break;
          }
          case 'Europa': {
            const ice = fbm3D(sx * 4, sy * 4, sz * 4, 4);
            const crack = fbm3D(sx * 12, sy * 12, sz * 12, 3);
            const crackLine = Math.abs(crack - 0.5) < 0.02 ? 30 : 0;
            r = 190 + ice * 30 + crackLine;
            g = 195 + ice * 30 + crackLine;
            b = 210 + ice * 30 + crackLine;
            break;
          }
          case 'Ganymede': {
            const n = fbm3D(sx * 4, sy * 4, sz * 4, 5);
            const dark = fbm3D(sx * 8, sy * 8, sz * 8, 3);
            r = 130 + n * 40 - (dark > 0.55 ? 25 : 0);
            g = 120 + n * 35 - (dark > 0.55 ? 20 : 0);
            b = 100 + n * 30 - (dark > 0.55 ? 15 : 0);
            break;
          }
          case 'Callisto': {
            const n = fbm3D(sx * 5, sy * 5, sz * 5, 5);
            const crater = fbm3D(sx * 12, sy * 12, sz * 12, 3);
            const v2 = 80 + n * 40 - (crater > 0.6 ? 20 : 0);
            r = v2; g = v2 * 0.92; b = v2 * 0.82;
            break;
          }
          case 'Titan': {
            const n = fbm3D(sx * 3, sy * 3, sz * 3, 4);
            r = 190 + n * 40;
            g = 150 + n * 30;
            b = 80 + n * 20;
            break;
          }
          case 'Enceladus': {
            const n = fbm3D(sx * 5, sy * 5, sz * 5, 3);
            const v2 = 220 + n * 30;
            r = v2; g = v2; b = v2 + 5;
            break;
          }
          default:
            r = 128; g = 128; b = 128;
        }

        const idx = (y * w + x) * 4;
        data[idx] = Math.max(0, Math.min(255, r));
        data[idx + 1] = Math.max(0, Math.min(255, g));
        data[idx + 2] = Math.max(0, Math.min(255, b));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  // ==================== 销毁 ====================

  dispose(scene) {
    this.ringSystem.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);  // v29-fix
    // 释放本实例创建的几何体与材质（材质仅 dispose 本身，不释放其共享的行星缓存纹理）
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        child.material.dispose();
      }
    });
    // 释放本实例创建的纹理（土星环/天王星环/标签 Sprite）
    if (this._ownTextures) {
      this._ownTextures.forEach((t) => t && t.dispose());
      this._ownTextures = [];
    }
    this.planets = [];
  }
}
