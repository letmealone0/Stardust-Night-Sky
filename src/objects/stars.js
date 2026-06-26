import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange } from '../utils/random.js';

export class StarField {
  constructor() {
    this.meshes = [];
    this.materials = [];
    this.geometries = [];
    this.brightStars = [];
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

    const material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
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
    const count = 4000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const galaxyRadius = spread * 0.6;
    const thickness = spread * 0.05;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 螺旋星系盘
      const radius = Math.random() * galaxyRadius;
      const angle = radius * 0.003 + Math.random() * Math.PI * 2;
      const armOffset = Math.sin(radius * 0.005 + Math.random() * Math.PI * 2) * 50;

      positions[i3] = Math.cos(angle + armOffset) * radius;
      positions[i3 + 1] = (Math.random() - 0.5) * thickness;
      positions[i3 + 2] = Math.sin(angle + armOffset) * radius;

      // 核心区域更亮、更密集
      const coreFactor = Math.max(0, 1 - radius / galaxyRadius);
      const brightness = 0.3 + coreFactor * 0.7;

      const warm = 0.08 + Math.random() * 0.06;
      const color = new THREE.Color().setHSL(warm, 0.3, brightness);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      sizes[i] = 0.2 + coreFactor * 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

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
