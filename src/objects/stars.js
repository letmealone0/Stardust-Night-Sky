/**
 * 星空背景系统
 * 使用 InstancedMesh 优化大量星星渲染
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange } from '../utils/random.js';

export class StarField {
  constructor() {
    this.meshes = [];
    this.materials = [];
    this.geometries = [];
  }

  /**
   * 初始化星空
   */
  init(scene) {
    const { layers, spread } = config.stars;

    // 创建多层星空
    layers.forEach((layer, index) => {
      this.createStarLayer(scene, layer, spread, index);
    });

    // 添加闪烁的亮星
    this.createBrightStars(scene, spread);

    console.log('[StarField] 星空初始化完成');
  }

  /**
   * 创建单层星空
   */
  createStarLayer(scene, layer, spread, layerIndex) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(layer.count * 3);
    const colors = new Float32Array(layer.count * 3);
    const sizes = new Float32Array(layer.count);

    for (let i = 0; i < layer.count; i++) {
      const i3 = i * 3;

      // 随机位置（球形分布）
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.5 + Math.random() * 0.5);

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      // 随机颜色（偏蓝白色）
      const hue = 0.55 + Math.random() * 0.1;
      const saturation = 0.1 + Math.random() * 0.3;
      const lightness = 0.7 + Math.random() * 0.3;
      const color = new THREE.Color().setHSL(hue, saturation, lightness);

      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // 随机大小
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

  /**
   * 创建闪烁的亮星
   */
  createBrightStars(scene, spread) {
    const count = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 随机位置
      positions[i3] = randomRange(-spread, spread);
      positions[i3 + 1] = randomRange(-spread, spread);
      positions[i3 + 2] = randomRange(-spread, spread);

      // 亮白色/蓝色
      const isBlue = Math.random() > 0.7;
      colors[i3] = isBlue ? 0.7 : 1.0;
      colors[i3 + 1] = isBlue ? 0.8 : 0.95;
      colors[i3 + 2] = 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.userData.isBrightStar = true;
    points.userData.time = 0;

    scene.add(points);
    this.meshes.push(points);
    this.materials.push(material);
    this.geometries.push(geometry);
  }

  /**
   * 更新星空
   */
  update(delta, elapsed) {
    // 亮星闪烁效果
    this.meshes.forEach((mesh) => {
      if (mesh.userData.isBrightStar) {
        mesh.userData.time += delta;
        mesh.material.opacity = 0.7 + Math.sin(mesh.userData.time * 2) * 0.3;
      }
    });
  }

  /**
   * 销毁星空
   */
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
