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

          float speedFactor = min(uSpeed / 40.0, 3.0);  // v17-fix: 不再限制在1.0，冲刺时更强

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
          // v17-fix: streak更强，冲刺时粒子更长
          float flowStrength = speedFactor * 20.0 * layerSpeed;
          vec3 streakOffset = streamDir * flowStrength * aRandom * uStreakLength * (1.0 + uSprintFactor * 1.5);
          // v16-fix: 不修改pos，streak只影响视觉形状不改变位置
          // (旧代码 pos -= streakOffset 会把粒子推离摄像机300单位，完全压过CPU移动的12.8单位)

          // 静止时微小漂浮
          float t = uTime * 0.5 * layerSpeed;
          pos.x += sin(t + aRandom * 6.28) * 1.2;
          pos.y += cos(t * 0.7 + aRandom * 6.28) * 1.2;
          pos.z += sin(t * 0.5 + aRandom * 6.28) * 1.2;

          // v18: 更亮的粒子 — 基础alpha 0.6，静止时也可见
          float baseAlpha = 0.6;
          vAlpha = baseAlpha + speedFactor * (0.3 + aRandom * 0.15);
          vAlpha *= (0.85 + vSpeedLayer * 0.3);
          vAlpha *= (1.0 + uSprintFactor * 2.5);
          vSprint = uSprintFactor;

          // v16: 传递屏幕空间拖尾方向
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vec4 streakEnd = modelViewMatrix * vec4(pos + streakOffset * 0.5, 1.0);
          vec2 screenStreak = (streakEnd.xy / streakEnd.w - mvPosition.xy / mvPosition.w);
          vStreakDir = normalize(screenStreak) * length(screenStreak) * 0.3;

          // v18: 增大粒子尺寸 ×3
          gl_PointSize = aSize * 3.0 * uPixelRatio * (500.0 / -mvPosition.z) * (1.0 + uSprintFactor * 1.5);
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
   * v18: 在运动方向前方生成粒子 — 简洁可靠
   * 粒子出现在前方锥形区域，随运动流经摄像机
   */
  resetParticleStream(i, spread, velDir, vLen) {
    const i3 = i * 3;
    const invLen = 1 / vLen;
    // 前方方向（摄像机移动方向的反方向 = 粒子来源方向）
    const sx = velDir.x * invLen;
    const sy = -velDir.y * invLen;
    const sz = velDir.z * invLen;
    
    // 前方距离 + 锥形散布
    const forwardDist = spread * (0.2 + Math.random() * 0.8);
    const spreadAngle = Math.random() * Math.PI * 2;
    const spreadR = spread * (0.05 + Math.random() * 0.25);
    
    this.positions[i3]     = sx * forwardDist + Math.cos(spreadAngle) * spreadR;
    this.positions[i3 + 1] = sy * forwardDist + Math.sin(spreadAngle) * spreadR;
    this.positions[i3 + 2] = sz * forwardDist + (Math.random() - 0.5) * spread * 0.3;
  }

  update(delta, elapsed, speed, velocity) {
    this.speed = speed;

    if (velocity) {
      this._velocity.copy(velocity);
    }

    // 更新 Shader uniforms — 用原始velocity（已在摄像机局部空间）
    const uniforms = this.material.uniforms;
    uniforms.uSpeed.value = speed;
    uniforms.uVelocity.value.copy(this._velocity);
    uniforms.uTime.value = elapsed;

    // 冲刺因子平滑过渡
    const isSprinting = speed > config.player.maxSpeed * config.player.sprintMultiplier * 0.8;
    const targetSprint = isSprinting ? 1.0 : 0.0;
    this._sprintFactor += (targetSprint - this._sprintFactor) * Math.min(1, delta * 5);
    uniforms.uSprintFactor.value = this._sprintFactor;

    // v18: 彻底重写 — 简单可靠的粒子流
    const spread = config.particleFlow?.spread || 200;
    const pos = this.positions;
    const vel = this._velocity;
    const vLen = vel.length();
    
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      
      if (vLen > 0.5) {
        // 粒子移动速度随实际速度变化
        const moveSpeed = speed / 40;
        
        // 移动粒子：与velocity反方向 = 粒子迎面而来
        pos[i3]     += vel.x * delta * moveSpeed * 20;
        pos[i3 + 1] -= vel.y * delta * moveSpeed * 20;
        pos[i3 + 2] -= vel.z * delta * moveSpeed * 20;
        
        // 太远或太近(飞过摄像机) → 重生到前方
        const dist = Math.sqrt(pos[i3]*pos[i3] + pos[i3+1]*pos[i3+1] + pos[i3+2]*pos[i3+2]);
        if (dist > spread * 1.2 || dist < 10) {
          this.resetParticleStream(i, spread, vel, vLen);
        }
      } else {
        // 静止时：超出范围重生为球形
        const dist = Math.sqrt(pos[i3]*pos[i3] + pos[i3+1]*pos[i3+1] + pos[i3+2]*pos[i3+2]);
        if (dist > spread * 1.5) {
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

