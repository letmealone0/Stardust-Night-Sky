/**
 * 太阳系系统
 * 太阳 + 8 大行星（含真实纹理）+ 卫星 + 土星环
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { noise2D, noise3D, fbm2D, fbm3D, turbulence2D } from '../utils/noise.js';

// ---- 行星数据（轨道半径、半径、公转周期、自转周期、倾角、偏心率）----
// v8.0: 行星半径 ×1.5，轨道微扩，增强可见性
const PLANET_DATA = [
  { name: 'Mercury', orbitRadius: 500,   radius: 7,    orbitPeriod: 88,     rotationPeriod: 58.6,  tilt: 0.03,  eccentricity: 0.21, color: '#8c7e6d' },
  { name: 'Venus',   orbitRadius: 800,   radius: 12,   orbitPeriod: 225,    rotationPeriod: -243,  tilt: 177.4,  eccentricity: 0.007, color: '#c8a44e' },
  { name: 'Earth',   orbitRadius: 1100,  radius: 13,   orbitPeriod: 365,    rotationPeriod: 1,     tilt: 23.4,   eccentricity: 0.017, color: '#2b5ea7' },
  { name: 'Mars',    orbitRadius: 1500,  radius: 9,    orbitPeriod: 687,    rotationPeriod: 1.03,  tilt: 25.2,   eccentricity: 0.093, color: '#c1440e' },
  { name: 'Jupiter', orbitRadius: 2600,  radius: 50,   orbitPeriod: 4333,   rotationPeriod: 0.41,  tilt: 3.1,    eccentricity: 0.049, color: '#c4a46a' },
  { name: 'Saturn',  orbitRadius: 4000,  radius: 40,   orbitPeriod: 10759,  rotationPeriod: 0.44,  tilt: 26.7,   eccentricity: 0.057, color: '#b8a060' },
  { name: 'Uranus',  orbitRadius: 5500,  radius: 20,   orbitPeriod: 30687,  rotationPeriod: -0.72, tilt: 97.8,   eccentricity: 0.046, color: '#7ec8c8' },
  { name: 'Neptune', orbitRadius: 7000,  radius: 19,   orbitPeriod: 60190,  rotationPeriod: 0.67,  tilt: 28.3,   eccentricity: 0.010, color: '#3d5fc4' },
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
const TIME_SCALE = 0.5; // 每秒 0.5 天，一年约 730 秒

export class SolarSystem {
  constructor() {
    this.group = new THREE.Group();
    this.sun = null;
    this.planets = [];     // { group, data, orbitPivot, moons[] }
    this.sunMaterial = null;
    this.camera = null;
    this._tempVec = new THREE.Vector3();
  }

  init(scene, camera) {
    this.camera = camera;
    const cfg = config.solarSystem;

    // 太阳
    this.createSun(cfg);

    // 行星 + 卫星
    PLANET_DATA.forEach((pData) => {
      this.createPlanet(pData, cfg);
    });

    // v8.0: 小行星带（火星与木星之间）
    this.createAsteroidBelt();

    // v8.0: 太阳耀斑粒子
    this.createSunFlares(cfg);

    scene.add(this.group);
    console.log('[SolarSystem] 太阳系初始化完成（太阳 + 8 行星 + 卫星 + 小行星带）');
  }

  setCamera(camera) {
    this.camera = camera;
  }

  // ==================== 太阳 ====================

  createSun(cfg) {
    const sunGeo = new THREE.SphereGeometry(cfg.sunRadius, 64, 64);
    this.sunMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying vec3 vNormal;
        uniform float uTime;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1,0));
          float c = hash(i + vec2(0,1));
          float d = hash(i + vec2(1,1));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p); p *= 2.02; a *= 0.5;
          }
          return v;
        }
        float turbulence2D_manual(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += abs(noise(p) * 2.0 - 1.0) * a; p *= 2.02; a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = vUv;
          float t = uTime * 0.05;

          // 多层湍流纹理
          float n1 = fbm(uv * 8.0 + t * 0.3);
          float n2 = fbm(uv * 16.0 - t * 0.2 + 100.0);
          float n3 = turbulence2D_manual(uv * 12.0 + t * 0.15);

          // 基色：亮黄 → 橙色渐变
          vec3 baseColor = mix(
            vec3(1.0, 0.9, 0.3),
            vec3(1.0, 0.6, 0.1),
            n1
          );

          // 暗区（日斑区域）
          float spots = smoothstep(0.55, 0.65, n2);
          baseColor = mix(baseColor, vec3(0.6, 0.2, 0.05), spots * 0.5);

          // 亮区（高温等离子体）
          float bright = smoothstep(0.6, 0.8, n3);
          baseColor = mix(baseColor, vec3(1.0, 1.0, 0.8), bright * 0.4);

          // 边缘变暗（模拟球体光照）
          float rim = dot(vNormal, vec3(0.0, 0.0, 1.0));
          baseColor *= 0.7 + 0.3 * max(0.0, rim);

          gl_FragColor = vec4(baseColor, 1.0);
        }
      `,
    });

    this.sun = new THREE.Mesh(sunGeo, this.sunMaterial);
    this.group.add(this.sun);

    // 太阳点光源（v8.0: 增强光照范围和强度，让行星可见）
    const sunLight = new THREE.PointLight(0xfff5e0, cfg.sunLightIntensity || 4.0, cfg.sunLightRange || 20000);
    sunLight.position.set(0, 0, 0);
    this.group.add(sunLight);

    // 太阳光晕
    const glowGeo = new THREE.SphereGeometry(cfg.sunRadius * 1.5, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0,0,1)), 2.0);
          gl_FragColor = vec4(1.0, 0.8, 0.3, intensity * 0.6);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    this.group.add(new THREE.Mesh(glowGeo, glowMat));

    // 日冕（外层辉光，更大范围）
    const coronaGeo = new THREE.SphereGeometry(cfg.sunRadius * 3, 32, 32);
    const coronaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform float uTime;
        void main() {
          float rim = 1.0 - max(0.0, dot(vNormal, vec3(0,0,1)));
          float intensity = pow(rim, 4.0);
          // 脉动
          float pulse = 0.8 + sin(uTime * 0.5) * 0.2;
          // 日冕颜色：外层偏红橙
          vec3 coronaColor = mix(vec3(1.0, 0.6, 0.2), vec3(1.0, 0.3, 0.1), rim);
          gl_FragColor = vec4(coronaColor, intensity * 0.25 * pulse);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    this.coronaMaterial = coronaMat;
    this.group.add(new THREE.Mesh(coronaGeo, coronaMat));
  }

  // ==================== 行星 ====================

  createPlanet(pData, cfg) {
    // 轨道枢轴（绕 Y 轴旋转 = 公转）
    const orbitPivot = new THREE.Group();

    // 行星组（偏移 + 倾斜）
    const planetGroup = new THREE.Group();
    planetGroup.position.x = pData.orbitRadius;

    // 轴倾角（度→弧度）
    const tiltRad = (pData.tilt * Math.PI) / 180;
    planetGroup.rotation.z = tiltRad;

    // 行星网格
    const texture = this.generatePlanetTexture(pData.name);
    // v8.0: 增强 emissive，让行星在黑暗背景中非常显眼
    const baseColor = new THREE.Color(pData.color);
    const emissiveColor = baseColor.clone().multiplyScalar(0.5);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.05,
      emissive: emissiveColor,
      emissiveIntensity: 0.4,
    });

    const segments = pData.radius > 20 ? 64 : 32;
    const geometry = new THREE.SphereGeometry(pData.radius, segments, segments);
    const mesh = new THREE.Mesh(geometry, material);
    planetGroup.add(mesh);

    // 大气层（类地行星 + 气态行星）
    if (['Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(pData.name)) {
      const atm = this.createAtmosphere(pData);
      planetGroup.add(atm);
    }

    // 土星环
    if (pData.name === 'Saturn') {
      const ring = this.createSaturnRing(pData.radius);
      planetGroup.add(ring);
    }

    // 天王星环（较暗淡）
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

    this.planets.push({
      group: planetGroup,
      orbitPivot,
      data: pData,
      mesh,
      material,
      moons,
      angle: Math.random() * Math.PI * 2, // 初始公转角
      rotAngle: 0,
    });
  }

  createAtmosphere(pData) {
    let atmColor;
    switch (pData.name) {
      case 'Venus':   atmColor = new THREE.Color(0.9, 0.8, 0.4); break;
      case 'Earth':   atmColor = new THREE.Color(0.3, 0.5, 1.0); break;
      case 'Mars':    atmColor = new THREE.Color(0.8, 0.4, 0.2); break;
      case 'Jupiter': atmColor = new THREE.Color(0.8, 0.7, 0.5); break;
      case 'Saturn':  atmColor = new THREE.Color(0.9, 0.8, 0.5); break;
      case 'Uranus':  atmColor = new THREE.Color(0.5, 0.8, 0.9); break;
      case 'Neptune': atmColor = new THREE.Color(0.3, 0.4, 0.9); break;
      default:        atmColor = new THREE.Color(0.5, 0.6, 1.0);
    }

    const atmRadius = pData.radius * 1.08;
    const geometry = new THREE.SphereGeometry(atmRadius, 32, 32);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: atmColor },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
          float intensity = pow(rim, 3.0);
          float alpha = intensity * 0.5;
          gl_FragColor = vec4(uColor * intensity, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });

    return new THREE.Mesh(geometry, material);
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

  // ==================== 卫星 ====================

  createMoon(mData) {
    const moonPivot = new THREE.Group();

    const texture = this.generateMoonTexture(mData.name);
    const moonColor = new THREE.Color(mData.color);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.05,
      emissive: moonColor.clone().multiplyScalar(0.15),
      emissiveIntensity: 0.15,
    });
    const geometry = new THREE.SphereGeometry(mData.radius, 16, 16);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = mData.orbitRadius;
    moonPivot.add(mesh);

    return moonPivot;
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
    const material = new THREE.LineBasicMaterial({
      color: 0x334455,
      transparent: true,
      opacity: 0.2,
    });
    return new THREE.Line(geometry, material);
  }

  // ==================== 小行星带（v8.0）====================

  createAsteroidBelt() {
    const count = 600;
    const innerR = 1800;  // 火星轨道（1500）之后
    const outerR = 2300;  // 木星轨道（2600）之前
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
      color: 0xffdd88,
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

  // ==================== 更新 ====================

  update(delta, elapsed) {
    const scaledDelta = delta * TIME_SCALE;

    // 太阳自转 + shader 动画
    if (this.sun) {
      this.sun.rotation.y += delta * 0.05;
    }
    if (this.sunMaterial) {
      this.sunMaterial.uniforms.uTime.value = elapsed;
    }
    // 日冕动画
    if (this.coronaMaterial) {
      this.coronaMaterial.uniforms.uTime.value = elapsed;
    }
    // v8.0: 小行星带缓慢旋转
    if (this.asteroidBelt && this.asteroidBelt.pivot) {
      this.asteroidBelt.pivot.rotation.y += delta * 0.02;
    }
    // v8.0: 太阳耀斑脉冲
    if (this.sunFlares && this.sunFlares.material) {
      this.sunFlares.material.opacity = 0.35 + Math.sin(elapsed * 2.5) * 0.2;
    }

    // 行星
    this.planets.forEach((planet) => {
      const d = planet.data;

      // 公转
      const orbitSpeed = (2 * Math.PI) / (d.orbitPeriod / TIME_SCALE);
      planet.angle += orbitSpeed * delta;
      planet.orbitPivot.rotation.y = planet.angle;

      // 自转
      const rotSpeed = (2 * Math.PI) / (Math.abs(d.rotationPeriod) * 10);
      planet.rotAngle += rotSpeed * delta * Math.sign(d.rotationPeriod);
      planet.mesh.rotation.y = planet.rotAngle;

      // 卫星公转
      planet.moons.forEach((moon) => {
        const moonSpeed = (2 * Math.PI) / (moon.data.orbitPeriod / TIME_SCALE);
        moon.angle += moonSpeed * delta;
        moon.group.rotation.y = moon.angle;
      });
    });
  }

  // ==================== 纹理生成 ====================

  generatePlanetTexture(name) {
    // v8.0: 降低纹理分辨率（512→128K像素，原1024→524K）大幅提升启动性能
    const w = 512, h = 256;
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
        // 转为球面 3D 坐标（减少极点失真）
        const lon = u * Math.PI * 2;
        const lat = v * Math.PI;
        const sx = Math.sin(lat) * Math.cos(lon);
        const sy = Math.cos(lat);
        const sz = Math.sin(lat) * Math.sin(lon);

        const [r, g, b] = this.samplePlanetColor(name, u, v, sx, sy, sz);
        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  samplePlanetColor(name, u, v, sx, sy, sz) {
    switch (name) {
      case 'Mercury': return this._mercury(u, v, sx, sy, sz);
      case 'Venus':   return this._venus(u, v, sx, sy, sz);
      case 'Earth':   return this._earth(u, v, sx, sy, sz);
      case 'Mars':    return this._mars(u, v, sx, sy, sz);
      case 'Jupiter': return this._jupiter(u, v, sx, sy, sz);
      case 'Saturn':  return this._saturn(u, v, sx, sy, sz);
      case 'Uranus':  return this._uranus(u, v, sx, sy, sz);
      case 'Neptune': return this._neptune(u, v, sx, sy, sz);
      default:        return [128, 128, 128];
    }
  }

  // ---- 水星：灰色，密布陨石坑 ----
  _mercury(u, v, sx, sy, sz) {
    const base = 110 + fbm3D(sx * 4, sy * 4, sz * 4, 5) * 50;
    // 陨石坑
    const crater = fbm3D(sx * 12, sy * 12, sz * 12, 4);
    const craterEdge = Math.abs(crater - 0.5) < 0.03 ? -30 : 0;
    const craterFloor = crater > 0.6 ? -15 : 0;
    const v2 = Math.max(60, Math.min(200, base + craterEdge + craterFloor));
    return [v2, v2 * 0.95, v2 * 0.9];
  }

  // ---- 金星：黄白色大气云纹 ----
  _venus(u, v, sx, sy, sz) {
    const n1 = fbm3D(sx * 3 + 10, sy * 3, sz * 3, 5);
    const n2 = fbm3D(sx * 6 + 20, sy * 6, sz * 6, 4);
    const swirl = fbm3D(sx * 2 + n1 * 2, sy * 2 + n2 * 2, sz * 2, 4);
    const base = 180 + swirl * 60;
    return [
      Math.min(255, base + 10),
      Math.min(255, base * 0.88),
      Math.min(255, base * 0.55),
    ];
  }

  // ---- 地球：海洋 + 大陆 + 冰盖 ----
  _earth(u, v, sx, sy, sz) {
    // 大陆形状（3D 噪声 → 球面映射，无极点失真）
    const continent = fbm3D(sx * 2.5, sy * 2.5, sz * 2.5, 6, 2.0, 0.55);
    const detail = fbm3D(sx * 8, sy * 8, sz * 8, 4) * 0.15;
    const height = continent + detail;

    // 冰盖（靠近极地）
    const polar = Math.abs(sy); // sy = cos(lat)，极地接近 1
    const iceCap = polar > 0.75 ? (polar - 0.75) / 0.25 : 0;

    // 海洋
    if (height < 0.42) {
      const depth = (0.42 - height) / 0.42;
      const r = 20 + depth * 10;
      const g = 50 + (1 - depth) * 40;
      const b = 140 + (1 - depth) * 60;
      // 浅海区域更亮
      if (height > 0.38) return [r + 20, g + 30, b - 20];
      return [r, g, b];
    }

    // 海滩
    if (height < 0.44) {
      return [190 + Math.random() * 20, 175 + Math.random() * 15, 120 + Math.random() * 20];
    }

    // 陆地
    const landN = fbm3D(sx * 5 + 50, sy * 5, sz * 5, 4);
    if (height < 0.55) {
      // 草地/森林
      const g = 80 + landN * 80;
      return [40 + landN * 30, g, 25 + landN * 15];
    }
    if (height < 0.65) {
      // 丘陵
      return [100 + landN * 40, 85 + landN * 30, 50 + landN * 20];
    }
    // 山脉
    const mountain = Math.min(255, 140 + landN * 60);
    return [mountain, mountain * 0.9, mountain * 0.8];
  }

  // ---- 火星：红褐色 + 极冠 ----
  _mars(u, v, sx, sy, sz) {
    const base = fbm3D(sx * 3, sy * 3, sz * 3, 5);
    const detail = fbm3D(sx * 10, sy * 10, sz * 10, 4) * 0.2;
    const height = base + detail;

    const polar = Math.abs(sy);
    if (polar > 0.82) {
      // 极冠（白色冰）
      const ice = (polar - 0.82) / 0.18;
      const v2 = 180 + ice * 70;
      return [v2, v2, v2 + 5];
    }

    // 地表
    const r = 150 + height * 70;
    const g = 80 + height * 40;
    const b = 40 + height * 25;
    // 暗区（火山平原）
    const dark = fbm3D(sx * 6 + 30, sy * 6, sz * 6, 3);
    if (dark > 0.6) return [r * 0.7, g * 0.7, b * 0.7];
    return [r, g, b];
  }

  // ---- 木星：横向条带 + 大红斑 ----
  _jupiter(u, v, sx, sy, sz) {
    const lat = sy; // -1 到 1
    // 条带
    const bands = Math.sin(lat * 18) * 0.5 + 0.5;
    const bandWarp = fbm3D(sx * 4, sy * 1.5, sz * 4, 3) * 0.3;
    const bandVal = bands + bandWarp;

    // 颜色映射
    let r, g, b;
    if (bandVal > 0.6) {
      r = 210; g = 185; b = 140; // 亮带
    } else if (bandVal > 0.4) {
      r = 185; g = 150; b = 100; // 中间
    } else {
      r = 150; g = 115; b = 75;  // 暗带
    }

    // 细节湍流
    const turb = fbm3D(sx * 8, sy * 3, sz * 8, 4);
    r += (turb - 0.5) * 30;
    g += (turb - 0.5) * 25;
    b += (turb - 0.5) * 20;

    // 大红斑（在特定经纬度附近）
    const spotU = 0.65, spotV = 0.55;
    const spotLon = (u - spotU) * 8;
    const spotLat = (v - spotV) * 16;
    const spotDist = Math.sqrt(spotLon * spotLon + spotLat * spotLat);
    if (spotDist < 1.0) {
      const spotBlend = 1 - spotDist;
      r = r + (190 - r) * spotBlend * 0.7;
      g = g + (80 - g) * spotBlend * 0.6;
      b = b + (60 - b) * spotBlend * 0.5;
    }

    return [
      Math.max(0, Math.min(255, r)),
      Math.max(0, Math.min(255, g)),
      Math.max(0, Math.min(255, b)),
    ];
  }

  // ---- 土星：米黄色条带 ----
  _saturn(u, v, sx, sy, sz) {
    const lat = sy;
    const bands = Math.sin(lat * 14) * 0.5 + 0.5;
    const warp = fbm3D(sx * 3, sy * 1, sz * 3, 3) * 0.2;
    const bandVal = bands + warp;

    let r = 190 + bandVal * 30;
    let g = 170 + bandVal * 25;
    let b = 120 + bandVal * 20;

    // 细节
    const detail = fbm3D(sx * 10, sy * 4, sz * 10, 3);
    r += (detail - 0.5) * 20;
    g += (detail - 0.5) * 18;
    b += (detail - 0.5) * 15;

    return [
      Math.max(0, Math.min(255, r)),
      Math.max(0, Math.min(255, g)),
      Math.max(0, Math.min(255, b)),
    ];
  }

  // ---- 天王星：淡蓝绿色，几乎均匀 ----
  _uranus(u, v, sx, sy, sz) {
    const n = fbm3D(sx * 4, sy * 4, sz * 4, 4);
    const band = Math.sin(sy * 6) * 0.03;
    return [
      Math.min(255, 120 + n * 25 + band * 20),
      Math.min(255, 195 + n * 20 + band * 15),
      Math.min(255, 195 + n * 20 + band * 10),
    ];
  }

  // ---- 海王星：深蓝色条带 ----
  _neptune(u, v, sx, sy, sz) {
    const lat = sy;
    const bands = Math.sin(lat * 10) * 0.5 + 0.5;
    const warp = fbm3D(sx * 3, sy * 2, sz * 3, 3) * 0.15;

    let r = 50 + (bands + warp) * 20;
    let g = 70 + (bands + warp) * 25;
    let b = 160 + (bands + warp) * 40;

    // 暗斑
    const spot = fbm3D(sx * 6 + 40, sy * 6, sz * 6, 3);
    if (spot > 0.65) {
      r *= 0.7; g *= 0.7; b *= 0.85;
    }

    return [
      Math.max(0, Math.min(255, r)),
      Math.max(0, Math.min(255, g)),
      Math.max(0, Math.min(255, b)),
    ];
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
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    this.planets = [];
  }
}
