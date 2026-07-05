/**
 * 全方向粒子流系统 v8.0
 * 三层视差架构 + 粒子拉伸拖尾 + 冲刺色彩增强
 * 核心功能：穿越星际的沉浸式粒子流动
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class ParticleFlow {
  constructor() {
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.camera = null;
    this.count = 10000;
    this.positions = null;
    this.speed = 0;
    this._velocity = new THREE.Vector3();
    this._sprintFactor = 0;
  }

  init(scene, camera) {
    this.camera = camera;
    this.count = config.particleFlow?.count || 10000;
    const cfg = config.particleFlow || {};

    const spread = cfg.spread || 200;
    const streakLen = cfg.streakLength || 4.0;
    const sprintBoost = cfg.sprintColorBoost || 1.5;

    this.positions = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const randoms = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, spread);

      const r = Math.random();
      // 三层分配：背景(0-0.3) 中间(0.3-0.8) 前景(0.8-1.0)
      if (r < 0.3) {
        sizes[i] = 0.2 + Math.random() * 0.4;
      } else if (r < 0.8) {
        sizes[i] = 0.5 + Math.random() * 0.8;
      } else {
        sizes[i] = 1.2 + Math.random() * 2.0; // v8.4: 更大前景粒子
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
        uStreakLength: { value: cfg.streakLength || 4.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aRandom;
        uniform float uSpeed;
        uniform vec3 uVelocity;
        uniform float uTime;
        uniform float uSprintFactor;
        uniform float uStreakLength;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vSpeedLayer;
        varying float vSprint;
        varying vec2 vStreakDir;

        void main() {
          vec3 pos = position;

          float speedFactor = min(uSpeed / 50.0, 1.0);

          // === 三层速度分级（视差效果）===
          float layerSpeed;
          if (aRandom < 0.3) {
            layerSpeed = 0.3;
            vSpeedLayer = 0.0;
          } else if (aRandom < 0.8) {
            layerSpeed = 1.0;
            vSpeedLayer = 0.5;
          } else {
            layerSpeed = 2.5;
            vSpeedLayer = 1.0;
          }

          // v16: 修正流向 — 取反Y/Z得到正确的摄像机相对流向
          vec3 streamDir = vec3(velDir.x, -velDir.y, -velDir.z);
          float flowStrength = speedFactor * 30.0 * layerSpeed;
          vec3 streakOffset = streamDir * flowStrength * aRandom * uStreakLength;
          // v16-fix: 不修改pos，streak只影响视觉形状不改变位置
          // (旧代码 pos -= streakOffset 会把粒子推离摄像机300单位，完全压过CPU移动的12.8单位)

          // 静止时微小漂浮
          float t = uTime * 0.5 * layerSpeed;
          pos.x += sin(t + aRandom * 6.28) * 1.2;
          pos.y += cos(t * 0.7 + aRandom * 6.28) * 1.2;
          pos.z += sin(t * 0.5 + aRandom * 6.28) * 1.2;

          // v16: 提升透明度让粒子更明显
          float baseAlpha = 0.35;
          vAlpha = baseAlpha + speedFactor * (0.6 + aRandom * 0.35);
          vAlpha *= (0.7 + vSpeedLayer * 0.5);
          vAlpha *= (1.0 + uSprintFactor * 1.8);
          vSprint = uSprintFactor;

          // v16: 传递屏幕空间拖尾方向
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vec4 streakEnd = modelViewMatrix * vec4(pos + streakOffset * 0.5, 1.0);
          vec2 screenStreak = (streakEnd.xy / streakEnd.w - mvPosition.xy / mvPosition.w);
          vStreakDir = normalize(screenStreak) * length(screenStreak) * 0.3;

          // v16: 增大粒子尺寸
          gl_PointSize = aSize * 2.5 * uPixelRatio * (500.0 / -mvPosition.z) * (1.0 + uSprintFactor * 1.2);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha;
        varying float vSpeedLayer;
        varying float vSprint;
        varying vec2 vStreakDir;

        void main() {
          // v8.0: 沿速度方向拉伸的椭圆粒子
          vec2 coord = gl_PointCoord - 0.5;
          // 沿拖尾方向压缩
          float streakLen = length(vStreakDir);
          if (streakLen > 0.001) {
            vec2 streakAxis = normalize(vStreakDir);
            float along = dot(coord, streakAxis);
            float across = dot(coord, vec2(-streakAxis.y, streakAxis.x));
            coord = vec2(along / (1.0 + streakLen * 2.0), across);
          }
          float d = length(coord) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          float core = 1.0 - smoothstep(0.0, 0.12, d);
          alpha = max(alpha * 0.7, core * 0.5);
          alpha *= vAlpha;
          if (alpha < 0.01) discard;

          // v16: 更亮的粒子颜色
          vec3 bgColor = vec3(1.0, 1.0, 1.0);
          vec3 midColor = vec3(0.85, 0.9, 1.0);
          vec3 fgColor = vec3(0.7, 0.85, 1.0);
          vec3 sprintColor = vec3(0.5, 0.85, 1.0);
          vec3 hyperColor = vec3(0.3, 0.95, 1.0);

          vec3 color = mix(bgColor, midColor, smoothstep(0.0, 0.5, vSpeedLayer));
          color = mix(color, fgColor, smoothstep(0.5, 1.0, vSpeedLayer));
          color = mix(color, sprintColor, vSprint * 0.7);
          // 前景粒子冲刺时偏超亮青蓝
          color = mix(color, hyperColor, vSprint * vSpeedLayer * 0.6);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.camera.add(this.points);

    console.log('[ParticleFlow] v8.0 超空间粒子流初始化完成，粒子数:', this.count, '分布范围:', cfg.spread);
  }

  resetParticle(i, spread) {
    const i3 = i * 3;
    // v8.4: 球形分布 + 前方集中
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = spread * (0.3 + Math.random() * 0.7);

    this.positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
    this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    this.positions[i3 + 2] = r * Math.cos(phi);
  }

  /**
   * v8.4: 在运动方向前方锥形区域生成粒子
   * v16: 修正流向 — 取反Y/Z得到正确的摄像机相对流向
   */
  resetParticleAhead(i, spread, velDir) {
    const i3 = i * 3;
    const r = spread * (0.2 + Math.random() * 0.8);
    // v16: 用修正后的流向（取反Y/Z）在前方生成粒子
    const streamX = velDir.x;
    const streamY = -velDir.y;
    const streamZ = -velDir.z;
    if (velDir.lengthSq() > 0.5) {
      const invLen = 1 / Math.sqrt(streamX*streamX + streamY*streamY + streamZ*streamZ);
      const sx = streamX * invLen, sy = streamY * invLen, sz = streamZ * invLen;
      // 在流向的反方向（前方）生成粒子
      this.positions[i3]     = -sx * r + (Math.random() - 0.5) * spread * 0.6;
      this.positions[i3 + 1] = -sy * r + (Math.random() - 0.5) * spread * 0.6;
      this.positions[i3 + 2] = -sz * r + (Math.random() - 0.5) * spread * 0.6;
    } else {
      this.resetParticle(i, spread);
    }
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
    const isSprinting = speed > config.player.maxSpeed * config.player.sprintMultiplier * 0.8;
    const targetSprint = isSprinting ? 1.0 : 0.0;
    this._sprintFactor += (targetSprint - this._sprintFactor) * Math.min(1, delta * 5);
    uniforms.uSprintFactor.value = this._sprintFactor;

    // CPU端粒子位置更新
    const spread = config.particleFlow?.spread || 200;
    const pos = this.positions;
    const vel = this._velocity;
    const speedNorm = Math.min(speed / 50, 1.0);

    // v8.4: 粒子从前方流来 — 密集锥形分布
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // v16: 修正流向 — X保持, Y/Z取反得到正确的摄像机相对流向
      pos[i3]     += vel.x * delta * speedNorm * 10;
      pos[i3 + 1] -= vel.y * delta * speedNorm * 10;
      pos[i3 + 2] -= vel.z * delta * speedNorm * 10;

      const distSq = pos[i3] * pos[i3] + pos[i3+1] * pos[i3+1] + pos[i3+2] * pos[i3+2];
      const vLen = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      
      // 粒子飞过相机或太远 → 在前方锥形区域重生
      if (distSq > spread * spread * 1.5 || 
          (vLen > 0.5 && distSq < spread * spread * 0.02)) {
        if (vLen > 0.5) {
          this.resetParticleAhead(i, spread, vel);
        } else {
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

