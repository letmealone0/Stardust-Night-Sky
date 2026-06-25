/**
 * 行星系统
 * 程序化生成行星，支持大气层和行星环
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange, randomChoice } from '../utils/random.js';

export class PlanetSystem {
  constructor() {
    this.planets = [];
    this.group = new THREE.Group();
  }

  /**
   * 初始化行星系统
   */
  init(scene) {
    const { count, minRadius, maxRadius, spread } = config.planets;

    for (let i = 0; i < count; i++) {
      const radius = randomRange(minRadius, maxRadius);
      const position = new THREE.Vector3(
        randomRange(-spread, spread),
        randomRange(-spread * 0.3, spread * 0.3),
        randomRange(-spread, spread)
      );

      const planet = this.createPlanet(radius, position, i);
      this.group.add(planet);
    }

    scene.add(this.group);
    console.log('[PlanetSystem] 行星系统初始化完成');
  }

  /**
   * 创建单个行星
   */
  createPlanet(radius, position, index) {
    const group = new THREE.Group();
    group.position.copy(position);

    // 行星本体
    const geometry = new THREE.SphereGeometry(radius, 64, 64);
    const material = this.createPlanetMaterial(radius, index);
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    // 大气层
    const atmosphere = this.createAtmosphere(radius);
    group.add(atmosphere);

    // 行星环（随机）
    if (Math.random() > 0.6) {
      const ring = this.createRing(radius);
      group.add(ring);
    }

    // 存储行星信息
    group.userData = {
      index,
      radius,
      rotationSpeed: randomRange(0.001, 0.01),
      orbitSpeed: randomRange(0.0001, 0.001),
      orbitRadius: position.length(),
      orbitAngle: Math.random() * Math.PI * 2,
      originalPosition: position.clone(),
    };

    this.planets.push(group);
    return group;
  }

  /**
   * 创建行星材质
   */
  createPlanetMaterial(radius, index) {
    // 不同类型的行星
    const types = ['rocky', 'gas', 'ice', 'lava'];
    const type = types[index % types.length];

    let color, emissive, roughness, metalness;

    switch (type) {
      case 'rocky':
        color = new THREE.Color(0.4, 0.35, 0.3);
        emissive = new THREE.Color(0.02, 0.02, 0.03);
        roughness = 0.8;
        metalness = 0.1;
        break;
      case 'gas':
        color = new THREE.Color(0.6, 0.5, 0.3);
        emissive = new THREE.Color(0.05, 0.03, 0.01);
        roughness = 0.3;
        metalness = 0.0;
        break;
      case 'ice':
        color = new THREE.Color(0.7, 0.8, 0.9);
        emissive = new THREE.Color(0.02, 0.03, 0.05);
        roughness = 0.2;
        metalness = 0.3;
        break;
      case 'lava':
        color = new THREE.Color(0.5, 0.2, 0.1);
        emissive = new THREE.Color(0.1, 0.04, 0.02);
        roughness = 0.6;
        metalness = 0.0;
        break;
    }

    return new THREE.MeshStandardMaterial({
      color,
      emissive,
      roughness,
      metalness,
      flatShading: false,
    });
  }

  /**
   * 创建大气层
   */
  createAtmosphere(radius) {
    const atmosphereRadius = radius * config.planets.atmosphereScale;
    const geometry = new THREE.SphereGeometry(atmosphereRadius, 64, 64);

    // 自定义大气层 Shader
    const material = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
          vec3 color = vec3(0.3, 0.6, 1.0);
          gl_FragColor = vec4(color, intensity * 0.6);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * 创建行星环
   */
  createRing(radius) {
    const innerRadius = radius * 1.4;
    const outerRadius = radius * 2.2;
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128);

    // 创建渐变纹理
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, 'rgba(180, 160, 140, 0.0)');
    gradient.addColorStop(0.2, 'rgba(180, 160, 140, 0.6)');
    gradient.addColorStop(0.5, 'rgba(200, 180, 160, 0.8)');
    gradient.addColorStop(0.8, 'rgba(180, 160, 140, 0.6)');
    gradient.addColorStop(1, 'rgba(180, 160, 140, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 64);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI * 0.5 + (Math.random() - 0.5) * 0.3;

    return ring;
  }

  /**
   * 更新行星系统
   */
  update(delta, elapsed) {
    this.planets.forEach((planet) => {
      const data = planet.userData;

      // 自转
      planet.children[0].rotation.y += data.rotationSpeed;

      // 公转
      data.orbitAngle += data.orbitSpeed;
      planet.position.x = data.originalPosition.x + Math.cos(data.orbitAngle) * data.orbitRadius * 0.1;
      planet.position.z = data.originalPosition.z + Math.sin(data.orbitAngle) * data.orbitRadius * 0.1;
    });
  }

  /**
   * 获取所有行星（用于后续交互）
   */
  getPlanets() {
    return this.planets;
  }

  /**
   * 销毁行星系统
   */
  dispose() {
    this.planets.forEach((planet) => {
      planet.children.forEach((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    });
  }
}
