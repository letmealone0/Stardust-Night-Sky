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
    this.camera = null;
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
   * 设置相机引用（用于 LOD）
   */
  setCamera(camera) {
    this.camera = camera;
  }

  /**
   * 创建单个行星
   */
  createPlanet(radius, position, index) {
    const group = new THREE.Group();
    group.position.copy(position);

    // 行星本体（LOD：远距离使用低面数）
    const material = this.createPlanetMaterial(radius, index);
    const lod = new THREE.LOD();
    const geoHigh = new THREE.SphereGeometry(radius, 64, 64);
    const geoMed  = new THREE.SphereGeometry(radius, 32, 32);
    const geoLow  = new THREE.SphereGeometry(radius, 16, 16);
    lod.addLevel(new THREE.Mesh(geoHigh, material), 0);
    lod.addLevel(new THREE.Mesh(geoMed, material), 300);
    lod.addLevel(new THREE.Mesh(geoLow, material), 800);
    group.add(lod);

    // 大气层（带 LOD）
    const atmLod = new THREE.LOD();
    const atmHigh = this.createAtmosphere(radius, 64);
    const atmMed  = this.createAtmosphere(radius, 32);
    const atmLow  = this.createAtmosphere(radius, 16);
    atmLod.addLevel(atmHigh, 0);
    atmLod.addLevel(atmMed, 300);
    atmLod.addLevel(atmLow, 800);
    group.add(atmLod);

    // 行星环（随机）
    if (Math.random() > 0.6) {
      const ring = this.createRing(radius);
      group.add(ring);
    }

    // 存储行星信息
    group.userData = {
      index,
      radius,
      lod,
      atmLod,
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
  /**
   * 生成程序化行星纹理（Canvas 2D）
   */
  generatePlanetTexture(type, seed) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const rng = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed & 0x7fffffff) / 0x7fffffff;
    };

    switch (type) {
      case 'rocky': {
        // 岩石纹理：噪点+陨石坑
        const baseColor = `hsl(${20 + rng() * 15}, ${20 + rng() * 20}%, ${30 + rng() * 20}%)`;
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, 512, 256);
        for (let i = 0; i < 300; i++) {
          const x = rng() * 512, y = rng() * 256;
          const r = 1 + rng() * 8;
          const bright = 40 + rng() * 30;
          ctx.fillStyle = `hsl(${20 + rng() * 10}, 10%, ${bright}%)`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 20; i++) {
          const x = rng() * 512, y = rng() * 256;
          const r = 5 + rng() * 15;
          ctx.fillStyle = `hsl(0, 0%, ${10 + rng() * 15}%)`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsl(0, 0%, ${25 + rng() * 10}%)`;
          ctx.beginPath();
          ctx.arc(x + r * 0.3, y - r * 0.3, r * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'gas': {
        // 气态行星：水平条纹
        const hueBase = 30 + rng() * 30;
        for (let y = 0; y < 256; y++) {
          const band = Math.sin(y * 0.1 + rng() * 2) * 0.5 + 0.5;
          const hue = hueBase + band * 20 + Math.sin(y * 0.05) * 10;
          const sat = 30 + band * 30;
          const lit = 40 + band * 30;
          ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
          ctx.fillRect(0, y, 512, 1);
        }
        for (let i = 0; i < 20; i++) {
          const y = rng() * 256;
          ctx.fillStyle = `hsla(${hueBase + 40}, 50%, 50%, 0.2)`;
          ctx.fillRect(0, y, 512, 2 + rng() * 5);
        }
        break;
      }
      case 'ice': {
        // 冰行星：裂纹纹理
        const baseLight = 60 + rng() * 30;
        for (let y = 0; y < 256; y++) {
          for (let x = 0; x < 512; x++) {
            const n = Math.sin(x * 0.02 + y * 0.03) * Math.cos(y * 0.01 - x * 0.015) * 0.5 + 0.5;
            const v = baseLight + n * 20;
            ctx.fillStyle = `hsl(210, ${10 + n * 20}%, ${v}%)`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
        // 裂纹
        for (let i = 0; i < 30; i++) {
          ctx.strokeStyle = `hsla(220, 30%, 80%, ${0.3 + rng() * 0.4})`;
          ctx.lineWidth = 0.5 + rng() * 1.5;
          ctx.beginPath();
          let cx = rng() * 512, cy = rng() * 256;
          ctx.moveTo(cx, cy);
          for (let j = 0; j < 10; j++) {
            cx += (rng() - 0.5) * 30;
            cy += (rng() - 0.5) * 15;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
        break;
      }
      case 'lava': {
        // 熔岩行星：暗底色+亮色裂缝
        ctx.fillStyle = '#1a0a05';
        ctx.fillRect(0, 0, 512, 256);
        for (let i = 0; i < 100; i++) {
          const cx = rng() * 512, cy = rng() * 256;
          const r = 5 + rng() * 25;
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          gradient.addColorStop(0, `hsla(20, 100%, ${40 + rng() * 40}%, ${0.3 + rng() * 0.4})`);
          gradient.addColorStop(1, 'hsla(20, 100%, 30%, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = 'hsla(30, 100%, 50%, 0.6)';
        ctx.lineWidth = 1 + rng() * 3;
        for (let i = 0; i < 15; i++) {
          ctx.beginPath();
          let cx = rng() * 512, cy = rng() * 256;
          ctx.moveTo(cx, cy);
          for (let j = 0; j < 20; j++) {
            cx += (rng() - 0.5) * 20;
            cy += (rng() - 0.5) * 15;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
        break;
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }

  createPlanetMaterial(radius, index) {
    const types = ['rocky', 'gas', 'ice', 'lava'];
    const type = types[index % types.length];

    let color, emissive, roughness, metalness, map;

    switch (type) {
      case 'rocky':
        color = new THREE.Color(0.5, 0.42, 0.35);
        emissive = new THREE.Color(0.02, 0.02, 0.03);
        roughness = 0.8;
        metalness = 0.1;
        map = this.generatePlanetTexture(type, index * 12345 + 999);
        break;
      case 'gas':
        color = new THREE.Color(0.7, 0.6, 0.4);
        emissive = new THREE.Color(0.05, 0.03, 0.01);
        roughness = 0.3;
        metalness = 0.0;
        map = this.generatePlanetTexture(type, index * 54321 + 777);
        break;
      case 'ice':
        color = new THREE.Color(0.8, 0.85, 1.0);
        emissive = new THREE.Color(0.02, 0.03, 0.05);
        roughness = 0.2;
        metalness = 0.3;
        map = this.generatePlanetTexture(type, index * 98765 + 555);
        break;
      case 'lava':
        color = new THREE.Color(0.6, 0.25, 0.1);
        emissive = new THREE.Color(0.2, 0.08, 0.02);
        roughness = 0.6;
        metalness = 0.0;
        map = this.generatePlanetTexture(type, index * 24680 + 333);
        break;
    }

    return new THREE.MeshStandardMaterial({
      color,
      map,
      emissive,
      roughness,
      metalness,
      flatShading: false,
    });
  }

  /**
   * 创建大气层
   */
  createAtmosphere(radius, segments = 64) {
    const atmosphereRadius = radius * config.planets.atmosphereScale;
    const geometry = new THREE.SphereGeometry(atmosphereRadius, segments, segments);

    // 基于 Rayleigh 散射的大气层 Shader
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.5, 0.3, 0.8).normalize() },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        uniform vec3 uSunDir;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
          float intensity = pow(rim, 3.0);

          // Rayleigh 散射：蓝光散射更强
          float cosTheta = dot(viewDir, uSunDir);
          float phase = 0.75 * (1.0 + cosTheta * cosTheta);

          vec3 rayleighColor = vec3(0.2, 0.45, 1.0);
          vec3 mieColor = vec3(0.6, 0.5, 0.7);

          vec3 color = mix(rayleighColor, mieColor, intensity * 0.5) * phase;
          float alpha = intensity * 0.5 * (0.6 + 0.4 * phase);

          gl_FragColor = vec4(color, alpha);
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

      // 自转（遍历 LOD levels 的所有子网格）
      if (data.lod) {
        for (let i = 0; i < data.lod.levels.length; i++) {
          const mesh = data.lod.levels[i].object;
          if (mesh) mesh.rotation.y += data.rotationSpeed;
        }
      }

      // 更新 LOD（基于相机距离）
      if (this.camera) {
        const dist = planet.position.distanceTo(this.camera.position);
        data.lod.update(this.camera);
        data.atmLod.update(this.camera);
      }

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
  dispose(scene) {
    scene.remove(this.group);
    this.planets.forEach((planet) => {
      planet.children.forEach((child) => {
        if (child.isLOD) {
          child.levels.forEach((level) => {
            const mesh = level.object;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (mesh.material.map) mesh.material.map.dispose();
              mesh.material.dispose();
            }
          });
        } else {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }
      });
    });
    this.planets = [];
  }
}
