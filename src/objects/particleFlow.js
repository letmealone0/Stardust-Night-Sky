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

          // v17-fix: 更亮的粒子，冲刺时更明显
          float baseAlpha = 0.5;
          vAlpha = baseAlpha + speedFactor * (0.3 + aRandom * 0.2);
          vAlpha *= (0.8 + vSpeedLayer * 0.4);
          vAlpha *= (1.0 + uSprintFactor * 2.0);
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
   * v17-fix2: 在运动方向前方锥形区域生成粒子
   * velocity已在摄像机局部空间，直接使用
   */
  resetParticleAhead(i, spread, velDir) {
    const i3 = i * 3;
    const vLen = Math.sqrt(velDir.x*velDir.x + velDir.y*velDir.y + velDir.z*velDir.z);
    if (vLen < 0.5) { this.resetParticle(i, spread); return; }
    
    // 前方方向 = velocity的反方向（velocity.z负=前进，前方=+Z方向）
    const nx = -velDir.x / vLen;
    const ny = velDir.y / vLen;
    const nz = velDir.z / vLen;
    
    const forwardDist = spread * (0.3 + Math.random() * 0.7);
    const coneAngle = Math.random() * Math.PI * 2;
    const coneRadius = (Math.random() * 0.4 + 0.1) * spread;
    const perpX = Math.cos(coneAngle) * coneRadius;
    const perpY = Math.sin(coneAngle) * coneRadius;
    
    this.positions[i3]     = nx * forwardDist + perpX;
    this.positions[i3 + 1] = ny * forwardDist + perpY;
    this.positions[i3 + 2] = nz * forwardDist + (Math.random() - 0.5) * spread * 0.3;
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

    // CPU端粒子位置更新
    const spread = config.particleFlow?.spread || 200;
    const pos = this.positions;
    const vel = this._velocity;
    // v17-fix2: velocity已在摄像机局部空间(player用controls.moveForward处理), 不需要再变换
    const speedNorm = Math.min(speed / 40, 3.0);
    const vLen = vel.length();
    // 流向：粒子应移动的方向（与velocity相反）
    const streamX = -vel.x, streamY = vel.y, streamZ = vel.z;
    const streamLen = Math.sqrt(streamX*streamX + streamY*streamY + streamZ*streamZ);
    
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // 移动粒子（沿velocity反方向 = 摄像机运动方向的反方向 = 粒子迎面而来）
      pos[i3]     -= vel.x * delta * speedNorm * 8;
      pos[i3 + 1] += vel.y * delta * speedNorm * 8;
      pos[i3 + 2] += vel.z * delta * speedNorm * 8;

      const distSq = pos[i3] * pos[i3] + pos[i3+1] * pos[i3+1] + pos[i3+2] * pos[i3+2];
      
      if (distSq > spread * spread * 1.5 || 
          (vLen > 0.5 && distSq < spread * spread * 0.02)) {
        if (vLen > 0.5) {
          this.resetParticleAhead(i, spread, vel);
        } else {
          this.resetParticle(i, spread);
        }
      }
      else if (vLen > 2.0 && Math.random() < 0.30) {
        const dotProduct = (pos[i3] * streamX + pos[i3+1] * streamY + pos[i3+2] * streamZ) / (streamLen + 0.01);
        if (dotProduct < 0 || Math.random() < 0.3) {
          this.resetParticleAhead(i, spread, vel);
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

