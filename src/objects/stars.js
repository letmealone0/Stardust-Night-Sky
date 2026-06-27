import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange } from '../utils/random.js';

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
    const count = 5000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count); // 随机种子（用于 Shader 动画）

    const galaxyRadius = spread * 0.5;
    const armCount = 4;                // 旋臂数量
    const spin = 1.5;                  // 螺旋旋转量
    const armSpread = 0.45;            // 旋臂散开程度
    const armLength = galaxyRadius * 0.85;
    const thickness = galaxyRadius * 0.04; // 银河盘厚度
    const dustLaneCount = Math.floor(count * 0.15); // 15% 粒子用于尘埃带

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      let x, y, z;
      let radius;
      let colorFactor = 0;

      if (i < count - dustLaneCount) {
        // ===== 旋臂粒子 =====
        // 使用 Three.js Journey 的 Galaxy Generator 模式
        const branchIndex = i % armCount;
        const branchAngle = (branchIndex / armCount) * Math.PI * 2;

        // 半径分布：中心密集，外层稀疏（r = rand^0.5）
        const rand = Math.pow(Math.random(), 0.5);
        radius = rand * armLength;

        // 螺旋角度 = 基础旋臂角 + 旋转量 * 半径 + 随机散开
        const spinAngle = spin * radius / armLength;
        const scatterAngle = (Math.random() - 0.5) * armSpread * (1 - rand * 0.3);

        const angle = branchAngle + spinAngle + scatterAngle;

        // 散开半径（离中心越远越散）
        const scatterRadius = (1 - rand * 0.7) * galaxyRadius * 0.12 * Math.random();

        x = Math.cos(angle) * (radius + scatterRadius);
        z = Math.sin(angle) * (radius + scatterRadius);
        y = (Math.random() - 0.5) * thickness * (1 - rand * 0.5); // 中心更薄

        // 颜色：核心暖黄 → 旋臂蓝白 → 外层暗红
        const normR = radius / armLength;
        if (normR < 0.15) {
          // 核心区域：暖黄/白色
          const hue = 0.08 + Math.random() * 0.05;
          const sat = 0.15 + Math.random() * 0.2;
          const light = 0.7 + rand * 0.3;
          const c = new THREE.Color().setHSL(hue, sat, light);
          colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
          colorFactor = 1.0;
        } else if (normR < 0.6) {
          // 旋臂区域：蓝白/淡蓝
          const hue = 0.55 + Math.random() * 0.1;
          const sat = 0.1 + Math.random() * 0.25;
          const light = 0.5 + rand * 0.4;
          const c = new THREE.Color().setHSL(hue, sat, light);
          colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
          colorFactor = 0.7;
        } else {
          // 外层：暗红/橙
          const hue = 0.02 + Math.random() * 0.06;
          const sat = 0.2 + Math.random() * 0.3;
          const light = 0.25 + rand * 0.3;
          const c = new THREE.Color().setHSL(hue, sat, light);
          colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
          colorFactor = 0.3;
        }

        sizes[i] = 0.15 + rand * 0.35;
      } else {
        // ===== 尘埃带粒子（暗色、低透明度）=====
        const angle = Math.random() * Math.PI * 2;
        radius = Math.pow(Math.random(), 0.3) * armLength * 0.9;
        const dustSpin = spin * 0.8 * radius / armLength;

        x = Math.cos(angle + dustSpin) * radius;
        z = Math.sin(angle + dustSpin) * radius;
        y = (Math.random() - 0.5) * thickness * 0.3;

        // 暗紫色/暗蓝色尘埃
        const hue = 0.6 + Math.random() * 0.15;
        const c = new THREE.Color().setHSL(hue, 0.3 + Math.random() * 0.2, 0.1 + Math.random() * 0.1);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
        colorFactor = 0.0;
        sizes[i] = 0.1 + Math.random() * 0.2;
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

    // 使用 ShaderMaterial 实现银河自转动画 + 软圆形粒子
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRotationSpeed: { value: 0.015 }, // 银河缓慢自转
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float aRandom;
        uniform float uTime;
        uniform float uRotationSpeed;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;

          // 银河缓慢自转（绕 Y 轴）
          float angle = uTime * uRotationSpeed;
          float cosA = cos(angle);
          float sinA = sin(angle);
          vec3 pos = position;
          float rx = pos.x * cosA - pos.z * sinA;
          float rz = pos.x * sinA + pos.z * cosA;
          pos.x = rx;
          pos.z = rz;

          // 微小闪烁（每颗星独立频率）
          vAlpha = 0.5 + sin(uTime * (0.5 + aRandom * 2.0) + aRandom * 6.28) * 0.3;

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
          // 软圆形粒子（避免方形像素感）
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
