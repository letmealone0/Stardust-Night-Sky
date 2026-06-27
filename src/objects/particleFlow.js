/**
 * 全方向粒子流系统 v7.1
 * 三层视差架构（参考 GalaxyThreeJS）：背景(慢/小/暗) + 中间(中/中/中) + 前景(快/大/亮)
 * 核心功能：上下移动时粒子流明显上下流动，穿越太空感
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class ParticleFlow {
  constructor() {
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.camera = null;
    this.count = 5000;
    this.positions = null;
    this.speed = 0;
    this._velocity = new THREE.Vector3();
    this._sprintFactor = 0;
  }

  init(scene, camera) {
    this.camera = camera;
    this.count = config.particleFlow?.count || 5000;

    const spread = 80; // v7.1: 更大分布范围
    this.positions = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const randoms = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, spread);

      const r = Math.random();
      // 三层分配：背景(0-0.3) 中间(0.3-0.8) 前景(0.8-1.0)
      if (r < 0.3) {
        // 背景层：小粒子
        sizes[i] = 0.2 + Math.random() * 0.4;
      } else if (r < 0.8) {
        // 中间层：中粒子
        sizes[i] = 0.5 + Math.random() * 0.8;
      } else {
        // 前景层：大粒子
        sizes[i] = 1.0 + Math.random() * 1.5;
      }
      randoms[i] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    // v7.1: 增强 Shader — 三层速度 + 更强流动 + 静止可见
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSpeed: { value: 0 },
        uVelocity: { value: new THREE.Vector3(0, 0, 0) },
        uTime: { value: 0 },
        uSprintFactor: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aRandom;
        uniform float uSpeed;
        uniform vec3 uVelocity;
        uniform float uTime;
        uniform float uSprintFactor;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vSpeedLayer;
        varying float vSprint;

        void main() {
          vec3 pos = position;

          float speedFactor = min(uSpeed / 50.0, 1.0);

          // === 三层速度分级（视差效果）===
          // aRandom < 0.3: 背景层（慢速 ×0.3）
          // 0.3 < aRandom < 0.8: 中间层（中速 ×1.0）
          // aRandom > 0.8: 前景层（快速 ×2.5）
          float layerSpeed;
          if (aRandom < 0.3) {
            layerSpeed = 0.3; // 背景慢速
            vSpeedLayer = 0.0;
          } else if (aRandom < 0.8) {
            layerSpeed = 1.0; // 中间中速
            vSpeedLayer = 0.5;
          } else {
            layerSpeed = 2.5; // 前景快速
            vSpeedLayer = 1.0;
          }

          // 主流动方向：沿速度反方向，强度随速度和层级增加
          float flowStrength = speedFactor * 20.0 * layerSpeed;
          pos -= uVelocity * flowStrength * aRandom;

          // 微小漂浮动画（背景层更慢）
          float t = uTime * 0.3 * layerSpeed;
          pos.x += sin(t + aRandom * 6.28) * 0.5;
          pos.y += cos(t * 0.7 + aRandom * 6.28) * 0.5;
          pos.z += sin(t * 0.5 + aRandom * 6.28) * 0.5;

          // 透明度：静止时微弱可见，移动时增强
          float baseAlpha = 0.15; // 静止基础透明度
          vAlpha = baseAlpha + speedFactor * (0.5 + aRandom * 0.4);
          // 前景层更亮
          vAlpha *= (0.6 + vSpeedLayer * 0.6);
          // 冲刺增强
          vAlpha *= (1.0 + uSprintFactor * 1.5);
          vSprint = uSprintFactor;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          // v7.1: 更大的粒子尺寸
          gl_PointSize = aSize * uPixelRatio * (350.0 / -mvPosition.z) * (1.0 + uSprintFactor * 0.8);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha;
        varying float vSpeedLayer;
        varying float vSprint;

        void main() {
          // 软圆形粒子
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          // 核心更亮（中心15%区域高亮度）
          float core = 1.0 - smoothstep(0.0, 0.15, d);
          alpha = max(alpha * 0.7, core * 0.5);
          alpha *= vAlpha;
          if (alpha < 0.01) discard;

          // 颜色：三层不同色调
          // 背景=暖白，中间=蓝白，前景=亮蓝+冲刺辉光
          vec3 bgColor = vec3(0.9, 0.9, 1.0);
          vec3 midColor = vec3(0.7, 0.8, 1.0);
          vec3 fgColor = vec3(0.5, 0.7, 1.0);
          vec3 sprintColor = vec3(0.4, 0.6, 1.0);

          vec3 color = mix(bgColor, midColor, smoothstep(0.0, 0.5, vSpeedLayer));
          color = mix(color, fgColor, smoothstep(0.5, 1.0, vSpeedLayer));
          color = mix(color, sprintColor, vSprint * 0.5);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.camera.add(this.points);

    console.log('[ParticleFlow] v7.1 三层粒子流系统初始化完成，粒子数:', this.count);
  }

  resetParticle(i, spread) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = spread * (0.2 + Math.random() * 0.8);

    this.positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
    this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    this.positions[i3 + 2] = r * Math.cos(phi);
  }

  update(delta, elapsed, speed, velocity) {
    this.speed = speed;

    if (velocity) {
      this._velocity.copy(velocity);
    }

    // 更新 Shader uniforms
    const uniforms = this.material.uniforms;
    uniforms.uSpeed.value = speed;
    uniforms.uVelocity.value.copy(this._velocity);
    uniforms.uTime.value = elapsed;

    // 冲刺因子平滑过渡
    const isSprinting = speed > config.player.moveSpeed * config.player.sprintMultiplier * 0.8;
    const targetSprint = isSprinting ? 1.0 : 0.0;
    this._sprintFactor += (targetSprint - this._sprintFactor) * Math.min(1, delta * 5);
    uniforms.uSprintFactor.value = this._sprintFactor;

    // CPU端粒子位置更新
    const spread = 80;
    const pos = this.positions;
    const vel = this._velocity;
    const speedNorm = Math.min(speed / 50, 1.0);

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // 应用速度偏移（CPU端补充GPU端的流动效果）
      pos[i3]     -= vel.x * delta * speedNorm * 6;
      pos[i3 + 1] -= vel.y * delta * speedNorm * 6;
      pos[i3 + 2] -= vel.z * delta * speedNorm * 6;

      // 循环：飞出球壳后在移动反方向远处重生
      const distSq = pos[i3] * pos[i3] + pos[i3+1] * pos[i3+1] + pos[i3+2] * pos[i3+2];
      if (distSq > spread * spread * 1.5) {
        const vLen = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
        if (vLen > 0.5) {
          // 有移动方向：在反方向重生
          const nx = -vel.x / vLen;
          const ny = -vel.y / vLen;
          const nz = -vel.z / vLen;
          const r = spread * (0.4 + Math.random() * 0.6);
          const theta = Math.random() * Math.PI * 2;
          const perpX = Math.cos(theta) * r * 0.3;
          const perpY = Math.sin(theta) * r * 0.3;
          pos[i3]     = nx * spread * 0.8 + perpX;
          pos[i3 + 1] = ny * spread * 0.8 + perpY;
          pos[i3 + 2] = nz * spread * 0.8 + (Math.random() - 0.5) * r * 0.3;
        } else {
          // 无移动：随机位置
          this.resetParticle(i, spread);
        }
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.camera && this.points) {
      this.camera.remove(this.points);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}
