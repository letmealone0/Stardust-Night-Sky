/**
 * 全方向粒子流系统
 * 相机附属粒子场，沿移动反方向流动，营造穿越太空感
 * 核心功能：上下移动时粒子流明显上下流动
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class ParticleFlow {
  constructor() {
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.camera = null;
    this.count = 3000;
    this.positions = null;    // 相对相机的位置
    this.velocities = null;   // 每粒子速度偏移
    this.speed = 0;
    this._velocity = new THREE.Vector3();
  }

  init(scene, camera) {
    this.camera = camera;
    this.count = config.particleFlow?.count || 3000;

    const spread = 40; // 分布在相机周围的球壳内
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const randoms = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, spread);
      sizes[i] = 0.3 + Math.random() * 0.7;
      randoms[i] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    // ShaderMaterial: GPU 端粒子动画，高效
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
        varying float vSprint;

        void main() {
          vec3 pos = position;

          // 根据速度方向偏移粒子（营造流动感）
          // 速度越大，偏移越明显
          float speedFactor = min(uSpeed / 50.0, 1.0);
          float flowStrength = speedFactor * 8.0;

          // 主流动方向：沿速度反方向
          pos -= uVelocity * flowStrength * aRandom;

          // 微小漂浮动画
          float t = uTime * 0.3;
          pos.x += sin(t + aRandom * 6.28) * 0.3;
          pos.y += cos(t * 0.7 + aRandom * 6.28) * 0.3;
          pos.z += sin(t * 0.5 + aRandom * 6.28) * 0.3;

          // 透明度：速度越快越亮，冲刺时更强
          vAlpha = speedFactor * (0.3 + aRandom * 0.5);
          vAlpha *= (1.0 + uSprintFactor * 0.8);
          vSprint = uSprintFactor;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = aSize * uPixelRatio * (200.0 / -mvPosition.z) * (1.0 + uSprintFactor * 0.5);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha;
        varying float vSprint;

        void main() {
          // 软圆形粒子
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha *= vAlpha;
          if (alpha < 0.01) discard;

          // 颜色：普通=白色偏蓝，冲刺=偏蓝白发光
          vec3 color = mix(vec3(0.7, 0.8, 1.0), vec3(0.5, 0.7, 1.0), vSprint);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.camera.add(this.points);

    console.log('[ParticleFlow] 粒子流系统初始化完成');
  }

  /**
   * 重置一个粒子到相机周围随机位置
   */
  resetParticle(i, spread) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = spread * (0.3 + Math.random() * 0.7);

    this.positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
    this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    this.positions[i3 + 2] = r * Math.cos(phi);

    this.velocities[i3]     = 0;
    this.velocities[i3 + 1] = 0;
    this.velocities[i3 + 2] = 0;
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

    // 冲刺因子（从 engine 获取不太方便，这里用速度判断）
    const isSprinting = speed > config.player.moveSpeed * config.player.sprintMultiplier * 0.8;
    const targetSprint = isSprinting ? 1.0 : 0.0;
    uniforms.uSprintFactor.value += (targetSprint - uniforms.uSprintFactor.value) * Math.min(1, delta * 5);

    // 粒子循环：飞出范围的粒子重置到另一侧
    const spread = 40;
    const pos = this.positions;
    const vel = this._velocity;
    const speedNorm = Math.min(speed / 50, 1.0);

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // 应用速度偏移（CPU端，配合GPU端的Shader偏移）
      pos[i3]     -= vel.x * delta * speedNorm * 2;
      pos[i3 + 1] -= vel.y * delta * speedNorm * 2;
      pos[i3 + 2] -= vel.z * delta * speedNorm * 2;

      // 循环：粒子飞出球壳后重置到另一侧
      const distSq = pos[i3] * pos[i3] + pos[i3+1] * pos[i3+1] + pos[i3+2] * pos[i3+2];
      if (distSq > spread * spread * 1.5) {
        // 在移动方向的反方向远处重生
        const backX = -vel.x * 0.5;
        const backY = -vel.y * 0.5;
        const backZ = -vel.z * 0.5;
        const r = spread * (0.5 + Math.random() * 0.5);
        const theta = Math.random() * Math.PI * 2;
        const offX = Math.cos(theta) * r * 0.3;
        const offY = Math.sin(theta) * r * 0.3;
        const offZ = (Math.random() - 0.5) * r * 0.3;

        pos[i3]     = backX + offX;
        pos[i3 + 1] = backY + offY;
        pos[i3 + 2] = backZ + offZ;
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
