/**
 * 黑洞系统
 * 事件视界 + 吸积盘 + 喷流 + 引力效果
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class BlackHole {
  constructor() {
    this.group = new THREE.Group();
    this.camera = null;
    this.accretionDisk = null;
    this.diskMaterial = null;
    this.jetParticles = null;
    this.dangerLevel = 0;
  }

  init(scene, camera) {
    this.camera = camera;
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
    const glowGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius * 3, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.3, 0.1, 0.5) },
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
          float intensity = pow(rim, 4.0);
          float pulse = 0.8 + sin(uTime * 0.5) * 0.2;
          vec3 color = uColor * intensity * pulse;
          float alpha = intensity * 0.3 * pulse;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.userData.material = glowMat;
    this.group.add(glow);

    scene.add(this.group);
    console.log('[BlackHole] 黑洞系统初始化完成');
  }

  createAccretionDisk(cfg) {
    const particleCount = 3000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const r = cfg.accretionInnerRadius + Math.random() * (cfg.accretionOuterRadius - cfg.accretionInnerRadius);
      const height = (Math.random() - 0.5) * 5;

      positions[i3] = Math.cos(angle) * r;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * r;

      const t = (r - cfg.accretionInnerRadius) / (cfg.accretionOuterRadius - cfg.accretionInnerRadius);
      if (t < 0.3) {
        const c = new THREE.Color(0.8 + Math.random() * 0.2, 0.85 + Math.random() * 0.15, 1.0);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      } else if (t < 0.6) {
        const c = new THREE.Color(1.0, 0.6 + Math.random() * 0.3, 0.2 + Math.random() * 0.2);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      } else {
        const c = new THREE.Color(0.8 + Math.random() * 0.2, 0.2 + Math.random() * 0.2, 0.05);
        colors[i3] = c.r; colors[i3 + 1] = c.g; colors[i3 + 2] = c.b;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.diskMaterial = new THREE.PointsMaterial({
      size: 2.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.accretionDisk = new THREE.Points(geometry, this.diskMaterial);
    this.accretionDisk.rotation.x = Math.PI * 0.5 + (Math.random() - 0.5) * 0.3;
    this.group.add(this.accretionDisk);
  }

  createJets(cfg) {
    const jetCount = 200;
    const positions = new Float32Array(jetCount * 2 * 3);
    const colors = new Float32Array(jetCount * 2 * 3);

    for (let jet = 0; jet < 2; jet++) {
      const direction = jet === 0 ? 1 : -1;
      for (let i = 0; i < jetCount; i++) {
        const i3 = (jet * jetCount + i) * 3;
        const t = Math.random();
        const r = cfg.eventHorizonRadius * 0.3 + t * cfg.eventHorizonRadius * 0.2;
        const angle = Math.random() * Math.PI * 2;
        const y = cfg.eventHorizonRadius * 1.5 + t * cfg.jetLength;

        positions[i3] = Math.cos(angle) * r * (1 + t * 0.5);
        positions[i3 + 1] = direction * y;
        positions[i3 + 2] = Math.sin(angle) * r * (1 + t * 0.5);

        const brightness = 1.0 - t * 0.5;
        colors[i3] = 0.3 + t * 0.4;
        colors[i3 + 1] = 0.5 + brightness * 0.3;
        colors[i3 + 2] = 1.0;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.jetParticles = new THREE.Points(geometry, material);
    this.group.add(this.jetParticles);
  }

  update(delta, elapsed) {
    if (this.accretionDisk) {
      this.accretionDisk.rotation.z += 0.005;
    }

    if (this.jetParticles) {
      this.jetParticles.material.opacity = 0.4 + Math.sin(elapsed * 2) * 0.2;
    }

    this.group.children.forEach((child) => {
      if (child.userData && child.userData.material && child.userData.material.uniforms) {
        child.userData.material.uniforms.uTime.value = elapsed;
      }
    });

    if (this.camera) {
      const dist = this.group.position.distanceTo(this.camera.position);
      const cfg = config.blackhole;
      if (dist < cfg.dangerRadius) {
        this.dangerLevel = Math.max(0, Math.min(1, 1.0 - (dist - cfg.pullRadius) / (cfg.dangerRadius - cfg.pullRadius)));
        if (dist < cfg.pullRadius && dist > cfg.eventHorizonRadius * 2) {
          const pullForce = (1 - dist / cfg.pullRadius) * cfg.pullStrength * delta;
          const direction = new THREE.Vector3()
            .subVectors(this.group.position, this.camera.position)
            .normalize();
          this.camera.position.add(direction.multiplyScalar(pullForce));
        }
      } else {
        this.dangerLevel = 0;
      }
    }
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
