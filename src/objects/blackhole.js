/**
 * 黑洞系统
 * 事件视界 + 吸积盘 + 喷流 + 引力效果 + 行星吸收
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

export class BlackHole {
  constructor() {
    this.group = new THREE.Group();
    this.camera = null;
    this.planetSystem = null; // 行星系统引用
    this.accretionDisk = null;
    this.diskMaterial = null;
    this.jetParticles = null;
    this.glowMaterial = null;
    this.dangerLevel = 0;
    this._tempVec = new THREE.Vector3();
    this._absorbParticles = null; // 吸收粒子系统
  }

  init(scene, camera, planetSystem) {
    this.camera = camera;
    this.planetSystem = planetSystem;
    const cfg = config.blackhole;
    this.group.position.set(cfg.position.x, cfg.position.y, cfg.position.z);

    // 事件视界：纯黑球体
    const horizonGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius, 64, 64);
    const horizonMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 1.0,
    });
    const horizon = new THREE.Mesh(horizonGeo, horizonMat);
    this.group.add(horizon);

    // 吸积盘
    this.createAccretionDisk(cfg);

    // 喷流
    this.createJets(cfg);

    // 外层光晕
    const glowGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius * 4, 32, 32);
    this.glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.4, 0.15, 0.6) },
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
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
          float intensity = pow(rim, 3.0);
          float pulse = 0.7 + sin(uTime * 0.8) * 0.3;
          vec3 color = uColor * intensity * pulse;
          float alpha = intensity * 0.4 * pulse;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, this.glowMaterial);
    this.group.add(glow);

    // 吸收粒子系统
    this.createAbsorbParticles(cfg);

    scene.add(this.group);
    console.log('[BlackHole] 黑洞系统初始化完成（含行星吸收）');
  }

  createAccretionDisk(cfg) {
    const particleCount = 8000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount); // 用于湍流扰动

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const rNorm = Math.pow(Math.random(), 0.6);
      const r = cfg.accretionInnerRadius + rNorm * (cfg.accretionOuterRadius - cfg.accretionInnerRadius);
      const height = (Math.random() - 0.5) * 4 * (1 - rNorm * 0.5);

      positions[i3] = Math.cos(angle) * r;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * r;

      const t = rNorm;
      if (t < 0.25) {
        const c = new THREE.Color(0.9 + Math.random() * 0.1, 0.9 + Math.random() * 0.1, 1.0);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      } else if (t < 0.55) {
        const c = new THREE.Color(1.0, 0.65 + Math.random() * 0.25, 0.2 + Math.random() * 0.15);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      } else {
        const c = new THREE.Color(0.7 + Math.random() * 0.2, 0.15 + Math.random() * 0.15, 0.03);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      }

      randoms[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    // ShaderMaterial: 湍流扰动 + 旋转动画
    this.diskMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRotationSpeed: { value: 0.15 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aRandom;
        uniform float uTime;
        uniform float uRotationSpeed;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;

        // 简单噪声
        float hash(float n) { return fract(sin(n) * 43758.5453); }

        void main() {
          vColor = color;

          vec3 pos = position;

          // 旋转动画
          float angle = uTime * uRotationSpeed;
          float cosA = cos(angle);
          float sinA = sin(angle);
          float rx = pos.x * cosA - pos.z * sinA;
          float rz = pos.x * sinA + pos.z * cosA;
          pos.x = rx;
          pos.z = rz;

          // 湍流扰动（噪声驱动的径向偏移）
          float turbulence = sin(uTime * 2.0 + aRandom * 20.0) * 0.3;
          turbulence += sin(uTime * 1.3 + aRandom * 15.0) * 0.2;
          float dist = length(pos.xz);
          float angle2 = atan(pos.z, pos.x) + turbulence / max(dist, 1.0);
          pos.x = cos(angle2) * dist;
          pos.z = sin(angle2) * dist;

          // 高度脉冲
          pos.y += sin(uTime * 3.0 + aRandom * 10.0) * 0.5;

          vAlpha = 0.7 + aRandom * 0.3;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = 1.8 * uPixelRatio * (200.0 / -mvPosition.z);
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

    this.accretionDisk = new THREE.Points(geometry, this.diskMaterial);
    this.accretionDisk.rotation.x = Math.PI * 0.5 + (Math.random() - 0.5) * 0.3;
    this.group.add(this.accretionDisk);
  }

  createJets(cfg) {
    const jetCount = 600; // 更多粒子填充更长喷流
    const positions = new Float32Array(jetCount * 2 * 3);
    const colors = new Float32Array(jetCount * 2 * 3);

    for (let jet = 0; jet < 2; jet++) {
      const direction = jet === 0 ? 1 : -1;
      for (let i = 0; i < jetCount; i++) {
        const i3 = (jet * jetCount + i) * 3;
        const t = Math.random();
        const r = cfg.eventHorizonRadius * 0.3 + t * cfg.eventHorizonRadius * 0.25;
        const angle = Math.random() * Math.PI * 2;
        const y = cfg.eventHorizonRadius * 1.5 + t * cfg.jetLength;

        positions[i3] = Math.cos(angle) * r * (1 + t * 0.6);
        positions[i3 + 1] = direction * y;
        positions[i3 + 2] = Math.sin(angle) * r * (1 + t * 0.6);

        const brightness = 1.0 - t * 0.4;
        colors[i3] = 0.35 + t * 0.35;
        colors[i3 + 1] = 0.55 + brightness * 0.3;
        colors[i3 + 2] = 1.0;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.jetParticles = new THREE.Points(geometry, material);
    this.group.add(this.jetParticles);
  }

  createAbsorbParticles(cfg) {
    // 用于行星被吸收时的螺旋粒子流
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const alphas = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;
      colors[i3] = 1.0;
      colors[i3 + 1] = 0.6;
      colors[i3 + 2] = 0.2;
      alphas[i] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this._absorbParticles = new THREE.Points(geometry, material);
    this._absorbParticles.userData = { active: false, targetPos: new THREE.Vector3(), progress: 0 };
    this.group.add(this._absorbParticles);
  }

  update(delta, elapsed) {
    const cfg = config.blackhole;

    // 吸积盘：Shader 驱动旋转 + 湍流（不再需要 CPU 端旋转）
    if (this.diskMaterial && this.diskMaterial.uniforms) {
      this.diskMaterial.uniforms.uTime.value = elapsed;
    }

    // 喷流脉冲
    if (this.jetParticles) {
      this.jetParticles.material.opacity = 0.5 + Math.sin(elapsed * 3) * 0.25;
    }

    // 光晕更新
    if (this.glowMaterial) {
      this.glowMaterial.uniforms.uTime.value = elapsed;
    }

    // 引力效果 + 重生检测（合并距离计算）
    if (this.camera) {
      const dist = this.group.position.distanceTo(this.camera.position);

      // 黑洞重生：离相机太远时在新位置重生
      if (dist > cfg.respawnDistance) {
        this.respawn(cfg);
        this.dangerLevel = 0;
      } else if (dist < cfg.dangerRadius) {
        this.dangerLevel = Math.max(0, Math.min(1, 1.0 - (dist - cfg.pullRadius) / (cfg.dangerRadius - cfg.pullRadius)));
        if (dist < cfg.pullRadius && dist > cfg.eventHorizonRadius * 2) {
          const pullForce = (1 - dist / cfg.pullRadius) * cfg.pullStrength * delta;
          this._tempVec.subVectors(this.group.position, this.camera.position).normalize();
          this.camera.position.addScaledVector(this._tempVec, pullForce);
        }
      } else {
        this.dangerLevel = 0;
      }
    }

    // 行星吸收检测
    this.updatePlanetAbsorption(cfg, delta, elapsed);
  }

  /**
   * 重生黑洞到相机附近的新位置
   */
  respawn(cfg) {
    const camPos = this.camera.position;

    const chunkX = Math.round(camPos.x / 2000);
    const chunkY = Math.round(camPos.y / 2000);
    const chunkZ = Math.round(camPos.z / 2000);
    const seed = hashCoords(chunkX * 31 + 17, chunkY * 37 + 23, chunkZ * 41 + 29);
    const rng = seededRandom(seed);

    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = cfg.respawnMin + rng() * (cfg.respawnMax - cfg.respawnMin);

    this.group.position.set(
      camPos.x + r * Math.sin(phi) * Math.cos(theta),
      camPos.y + r * Math.sin(phi) * Math.sin(theta) * 0.3,
      camPos.z + r * Math.cos(phi)
    );

    this.dangerLevel = 0;
  }

  updatePlanetAbsorption(cfg, delta, elapsed) {
    if (!this.planetSystem) return;

    const planets = this.planetSystem.getPlanets();
    const bhPos = this.group.position;

    for (let i = planets.length - 1; i >= 0; i--) {
      const planet = planets[i];
      const dist = bhPos.distanceTo(planet.position);

      if (dist < cfg.absorbRadius) {
        const data = planet.userData;
        if (!data.beingAbsorbed) {
          // 开始吸收
          data.beingAbsorbed = true;
          data.absorbProgress = 0;
          data.originalScale = planet.scale.x;
        }

        // 吸收进度
        data.absorbProgress += delta * 0.5;

        // 逐渐缩小
        const shrink = Math.max(0, 1 - data.absorbProgress);
        planet.scale.setScalar(data.originalScale * shrink);

        // 颜色偏移（变红变暗）
        planet.traverse((child) => {
          if (child.material && child.material.emissive) {
            child.material.emissive.lerp(new THREE.Color(0.5, 0.1, 0.0), delta * 2);
          }
        });

        // 激活吸收粒子
        if (this._absorbParticles && !this._absorbParticles.userData.active) {
          this._absorbParticles.userData.active = true;
          this._absorbParticles.userData.targetPos.copy(planet.position);
          this._absorbParticles.userData.progress = 0;
        }

        // 完全吸收后移除行星
        if (data.absorbProgress >= 1.0) {
          if (planet.parent) planet.parent.remove(planet);
          planet.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          });
          planets.splice(i, 1);

          // 停止吸收粒子
          if (this._absorbParticles) {
            this._absorbParticles.userData.active = false;
          }
        }
      }
    }

    // 更新吸收粒子动画
    if (this._absorbParticles && this._absorbParticles.userData.active) {
      this.updateAbsorbParticles(cfg, delta, elapsed);
    }
  }

  updateAbsorbParticles(cfg, delta, elapsed) {
    const data = this._absorbParticles.userData;
    data.progress += delta * 0.8;

    const pos = this._absorbParticles.geometry.attributes.position.array;
    const count = pos.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const t = (i / count + data.progress) % 1.0;
      const angle = t * Math.PI * 6 + i * 0.1;
      const radius = (1 - t) * cfg.absorbRadius * 0.5;

      // 螺旋向中心
      pos[i3] = data.targetPos.x - this.group.position.x + Math.cos(angle) * radius;
      pos[i3 + 1] = data.targetPos.y - this.group.position.y + (1 - t) * 20 * Math.sin(t * Math.PI);
      pos[i3 + 2] = data.targetPos.z - this.group.position.z + Math.sin(angle) * radius;
    }

    this._absorbParticles.geometry.attributes.position.needsUpdate = true;
    this._absorbParticles.material.opacity = Math.max(0, 1 - data.progress * 0.5);
  }

  getDangerLevel() {
    return this.dangerLevel;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}
