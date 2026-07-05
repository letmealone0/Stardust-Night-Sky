import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange } from '../utils/random.js';

// v7.1: 高斯随机分布（参考 GalaxyThreeJS），让粒子更自然聚集在旋臂中
function gaussianRandom(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

export class StarField {
  constructor() {
    this.meshes = [];
    this.materials = [];
    this.geometries = [];
    this.brightStars = [];
    this.galaxyMaterial = null; // 银河 Shader 材质（用于更新时间）
  }

  init(scene) {
    const { layers, spread } = config.stars;

    layers.forEach((layer, index) => {
      this.createStarLayer(scene, layer, spread, index);
    });

    this.createBrightStars(scene, spread);
    this.createMilkyWay(scene, spread);
    // v13: 深场背景星星 (挂到scene而非galaxyGroup，作为固定背景)
    this.createDeepField(scene);

    console.log('[StarField] 星空初始化完成');
  }

  createStarLayer(scene, layer, spread, layerIndex) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(layer.count * 3);
    const colors = new Float32Array(layer.count * 3);
    const sizes = new Float32Array(layer.count);

    for (let i = 0; i < layer.count; i++) {
      const i3 = i * 3;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.5 + Math.random() * 0.5);

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      // 真实星色分布（OBAFGKM）
      const starType = Math.random();
      let hue, saturation, lightness;
      if (starType < 0.15) {
        // O/B: 蓝巨星
        hue = 0.58 + Math.random() * 0.04;
        saturation = 0.2 + Math.random() * 0.3;
        lightness = 0.8 + Math.random() * 0.2;
      } else if (starType < 0.35) {
        // A/F: 白色
        hue = 0.08 + Math.random() * 0.04;
        saturation = 0.05 + Math.random() * 0.1;
        lightness = 0.8 + Math.random() * 0.2;
      } else if (starType < 0.60) {
        // G: 黄色（类太阳）
        hue = 0.10 + Math.random() * 0.05;
        saturation = 0.2 + Math.random() * 0.3;
        lightness = 0.7 + Math.random() * 0.3;
      } else if (starType < 0.85) {
        // K: 橙色
        hue = 0.07 + Math.random() * 0.03;
        saturation = 0.4 + Math.random() * 0.3;
        lightness = 0.6 + Math.random() * 0.2;
      } else {
        // M: 红矮星
        hue = 0.01 + Math.random() * 0.03;
        saturation = 0.5 + Math.random() * 0.4;
        lightness = 0.4 + Math.random() * 0.3;
      }

      const color = new THREE.Color().setHSL(hue, saturation, lightness);

      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      sizes[i] = randomRange(layer.size[0], layer.size[1]);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha *= 0.8;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const points = new THREE.Points(geometry, material);
    points.userData.layerIndex = layerIndex;
    points.userData.depth = layer.depth;

    scene.add(points);
    this.meshes.push(points);
    this.materials.push(material);
    this.geometries.push(geometry);
  }

  createBrightStars(scene, spread) {
    const count = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const frequencies = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      positions[i3] = randomRange(-spread, spread);
      positions[i3 + 1] = randomRange(-spread, spread);
      positions[i3 + 2] = randomRange(-spread, spread);

      const isBlue = Math.random() > 0.7;
      colors[i3] = isBlue ? 0.7 : 1.0;
      colors[i3 + 1] = isBlue ? 0.8 : 0.95;
      colors[i3 + 2] = 1.0;

      phases[i] = Math.random() * Math.PI * 2;
      frequencies[i] = 0.5 + Math.random() * 2.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aFrequency', new THREE.BufferAttribute(frequencies, 1));

    // 使用 ShaderMaterial 将闪烁计算迁移到 GPU，避免每帧 CPU 遍历
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 6.0 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aPhase;
        attribute float aFrequency;
        uniform float uTime;
        uniform float uSize;
        varying vec3 vColor;
        void main() {
          float twinkle = 0.5 + sin(uTime * aFrequency + aPhase) * 0.5;
          float factor = 0.7 + twinkle * 0.3;
          vColor = aColor * factor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.userData.isBrightStar = true;

    scene.add(points);
    this.meshes.push(points);
    this.materials.push(material);
    this.geometries.push(geometry);
    this.brightStars.push({ points, material });
  }

  createMilkyWay(scene, spread) {
    // v8.0: 银河系配置
    const galaxyCfg = config.stars.galaxy || {};
    const count = galaxyCfg.count || 20000;
    const armCount = galaxyCfg.armCount || 5;
    const spin = galaxyCfg.spin || 2.5;
    const armSpread = galaxyCfg.armSpread || 0.25;
    const tiltDeg = galaxyCfg.tilt || 30;
    const galaxyScale = galaxyCfg.scale || 2.0;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);

    const galaxyRadius = spread * 0.5 * galaxyScale;
    const armLength = galaxyRadius * 0.85;
    const thickness = galaxyRadius * 0.03;
    const dustLaneCount = Math.floor(count * 0.1);
    const coreBulgeCount = Math.floor(count * 0.08); // 核球粒子

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let x, y, z, radius, colorFactor;

      if (i < coreBulgeCount) {
        // ===== 核球：密集椭球体，金白色 =====
        const bulgeR = armLength * 0.12;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        radius = Math.pow(Math.random(), 1.5) * bulgeR;
        x = Math.cos(theta) * Math.sin(phi) * radius;
        z = Math.sin(theta) * Math.sin(phi) * radius;
        y = Math.cos(phi) * radius * 0.3; // 压扁

        const hue = 0.1 + Math.random() * 0.04;
        const c = new THREE.Color().setHSL(hue, 0.2, 0.7 + Math.random() * 0.3);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
        colorFactor = 1.0;
        sizes[i] = 0.2 + Math.random() * 0.5;
      } else if (i < count - dustLaneCount) {
        // ===== 旋臂粒子 =====
        const branchIndex = (i - coreBulgeCount) % armCount;
        const branchAngle = (branchIndex / armCount) * Math.PI * 2;
        const rand = Math.pow(Math.random(), 0.5);
        radius = rand * armLength;

        const spinAngle = spin * radius / armLength;
        const scatterAngle = gaussianRandom(0, armSpread * 0.25) * (1 - rand * 0.3);
        const angle = branchAngle + spinAngle + scatterAngle;
        const scatterRadius = gaussianRandom(0, galaxyRadius * 0.05) * (1 - rand * 0.7);

        x = Math.cos(angle) * (radius + scatterRadius);
        z = Math.sin(angle) * (radius + scatterRadius);
        y = (Math.random() - 0.5) * thickness * (1 - rand * 0.5);

        const normR = radius / armLength;
        if (normR < 0.12) {
          const c = new THREE.Color().setHSL(0.1 + Math.random() * 0.04, 0.1 + Math.random() * 0.2, 0.75 + rand * 0.25);
          colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
          colorFactor = 1.0;
        } else if (normR < 0.55) {
          const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.08 + Math.random() * 0.2, 0.55 + rand * 0.35);
          colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
          colorFactor = 0.8;
        } else {
          const c = new THREE.Color().setHSL(0.58 + Math.random() * 0.08, 0.15 + Math.random() * 0.2, 0.2 + rand * 0.3);
          colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
          colorFactor = 0.35;
        }
        sizes[i] = 0.12 + rand * 0.3;
      } else {
        // ===== 尘埃带 =====
        const angle = Math.random() * Math.PI * 2;
        radius = Math.pow(Math.random(), 0.3) * armLength * 0.9;
        const dustSpin = spin * 0.7 * radius / armLength;
        x = Math.cos(angle + dustSpin) * radius;
        z = Math.sin(angle + dustSpin) * radius;
        y = (Math.random() - 0.5) * thickness * 0.25;
        const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.15, 0.25, 0.08 + Math.random() * 0.08);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
        colorFactor = 0.0;
        sizes[i] = 0.08 + Math.random() * 0.15;
      }

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
      randoms[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCoreRotSpeed: { value: 0.008 },     // v10.0: 银心基准角速度
        uRadiusFalloff: { value: 0.00004 },  // v10.0: 较差自转衰减
        uTimeScale: { value: 1.0 },          // v10.0: 全局调速
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float aRandom;
        uniform float uTime;
        uniform float uCoreRotSpeed;
        uniform float uRadiusFalloff;
        uniform float uTimeScale;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          // v10.0: 较差自转 — 内圈快外圈慢
          float r = length(position.xz) + 0.01;
          float localSpeed = uCoreRotSpeed / (0.1 + r * uRadiusFalloff);
          float angle = uTime * localSpeed * uTimeScale;
          float cosA = cos(angle);
          float sinA = sin(angle);
          vec3 pos = position;
          float rx = pos.x * cosA - pos.z * sinA;
          float rz = pos.x * sinA + pos.z * cosA;
          pos.x = rx;
          pos.z = rz;
          // v10.0: 银心亮度脉动
          float corePulse = 1.0 + sin(uTime * 1.5) * 0.1 / (r * 0.0001 + 0.5);
          vAlpha = (0.5 + sin(uTime * (0.5 + aRandom * 2.0) + aRandom * 6.28) * 0.3) * corePulse;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha *= vAlpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.galaxyMaterial = material;

    const points = new THREE.Points(geometry, material);
    points.userData.isGalaxy = true;

    // v8.0: 将银河包装在 Group 中，重定位到远处背景
    const galaxyGroup = new THREE.Group();
    const posCfg = galaxyCfg.position || { x: 0, y: -3000, z: -8000 };
    galaxyGroup.position.set(posCfg.x, posCfg.y, posCfg.z);
    // 倾斜30°让银河从太阳系平面可见
    galaxyGroup.rotation.x = (tiltDeg * Math.PI) / 180;
    galaxyGroup.add(points);
    scene.add(galaxyGroup);

    this.meshes.push(galaxyGroup);
    this.materials.push(material);
    this.geometries.push(geometry);

    // v8.0: 银河雾气层
    this.createGalaxyHaze(scene, galaxyGroup, armCount, spin, armLength, thickness, galaxyScale, tiltDeg);
  }

  /**
   * v8.0: 银河雾气层 — 大粒子低透明度，模拟银河尘雾
   */
  createGalaxyHaze(scene, galaxyGroup, armCount, spin, armLength, thickness, galaxyScale, tiltDeg) {
    const hazeCount = config.stars.galaxy?.hazeCount || 3000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(hazeCount * 3);
    const col = new Float32Array(hazeCount * 3);

    for (let i = 0; i < hazeCount; i++) {
      const i3 = i * 3;
      const branchIndex = i % armCount;
      const branchAngle = (branchIndex / armCount) * Math.PI * 2;
      const rand = Math.pow(Math.random(), 0.4);
      const radius = rand * armLength;
      const spinAngle = spin * radius / armLength;
      const scatterAngle = gaussianRandom(0, 0.12);

      const angle = branchAngle + spinAngle + scatterAngle;
      const scatterR = gaussianRandom(0, armLength * 0.07);

      pos[i3]     = Math.cos(angle) * (radius + scatterR);
      pos[i3 + 1] = gaussianRandom(0, thickness * 0.6);
      pos[i3 + 2] = Math.sin(angle) * (radius + scatterR);

      // 温暖的淡紫色/淡蓝色雾气
      const hue = 0.6 + Math.random() * 0.15;
      const c = new THREE.Color().setHSL(hue, 0.15 + Math.random() * 0.15, 0.35 + Math.random() * 0.25);
      col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const hazeMat = new THREE.PointsMaterial({
      size: 3.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.07,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const hazePoints = new THREE.Points(geo, hazeMat);
    hazePoints.userData.isGalaxyHaze = true;
    galaxyGroup.add(hazePoints);
    this.meshes.push(hazePoints);
    this.materials.push(hazeMat);
    this.geometries.push(geo);
  }

  /** v13: 深场背景星星 — 数十万微小暗淡的点，模拟真实天文照片背景密度 */
  createDeepField(scene) {
    const cfg = config.stars.deepField;
    if (!cfg) return;
    const { count, spread, opacity, minSize, maxSize } = cfg;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.6 + Math.random() * 0.4);

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      // 真实颜色分布：大部分暗红/暗黄，少量蓝白
      const type = Math.random();
      let c;
      if (type < 0.6) {
        // M/K型红矮星 (最常见)
        c = new THREE.Color().setHSL(0.05 + Math.random() * 0.05, 0.3 + Math.random() * 0.3, 0.3 + Math.random() * 0.2);
      } else if (type < 0.85) {
        // G型黄星
        c = new THREE.Color().setHSL(0.1 + Math.random() * 0.05, 0.15 + Math.random() * 0.2, 0.4 + Math.random() * 0.3);
      } else {
        // B/A型蓝白星 (稀少)
        c = new THREE.Color().setHSL(0.58 + Math.random() * 0.06, 0.1 + Math.random() * 0.2, 0.6 + Math.random() * 0.3);
      }
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: randomRange(minSize, maxSize),
      vertexColors: true,
      transparent: true,
      opacity: opacity,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.userData.isDeepField = true;
    scene.add(points);

    this.meshes.push(points);
    this.materials.push(material);
    this.geometries.push(geometry);
  }

  update(delta, elapsed) {
    // 亮星闪烁已迁移到 GPU（ShaderMaterial），只需更新时间 uniform
    this.brightStars.forEach(({ points, material }) => {
      if (material.uniforms) {
        material.uniforms.uTime.value = elapsed;
      }
    });

    // 银河自转动画
    if (this.galaxyMaterial && this.galaxyMaterial.uniforms) {
      this.galaxyMaterial.uniforms.uTime.value = elapsed;
    }
  }

  dispose(scene) {
    this.meshes.forEach((m) => scene.remove(m));
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.meshes = [];
    this.geometries = [];
    this.materials = [];
    this.brightStars = [];
  }
}
