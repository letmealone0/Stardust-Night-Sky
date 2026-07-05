/**
 * 全方向粒子流系统 v19.1
 *
 * 设计原理（参考 Elite Dangerous / No Man's Sky 的粒子流实现）：
 * - 粒子挂载在场景中的跟随 Group（随相机移动+旋转）
 * - Group 每帧同步到相机位置和朝向，Group-local 等效于 camera-local
 * - 世界空间速度通过逆四元数转为 Group-local 方向
 * - 粒子沿 -localVel 方向流动（环境从前方飞向相机再掠过）
 * - 球形全方向分布 + 三层视差
 * - 粒子拉伸拖尾在屏幕上沿速度方向
 *
 * 关键教训：不能 camera.add(points)，因为相机不在 scene 树中，
 * renderer.render(scene, camera) 不会遍历相机的子节点！必须挂到 scene 中。
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class ParticleFlow {
  constructor() {
    this.group = null;        // scene-attached跟随group
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.camera = null;
    this.count = 10000;
    this.positions = null;
    this.speed = 0;
    this._localVel = new THREE.Vector3();
    this._worldVel = new THREE.Vector3();
    this._sprintFactor = 0;
    this._invQuat = new THREE.Quaternion();
  }

  init(scene, camera) {
    this.camera = camera;
    this.count = config.particleFlow?.count || 20000;
    const cfg = config.particleFlow || {};

    const spread = cfg.spread || 200;

    // 创建跟随 group，添加到场景
    this.group = new THREE.Group();
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    scene.add(this.group);

    this.positions = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const randoms = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.resetParticleSphere(i, spread);

      const r = Math.random();
      if (r < 0.3) {
        sizes[i] = 0.2 + Math.random() * 0.15;
      } else if (r < 0.8) {
        sizes[i] = 0.4 + Math.random() * 0.25;
      } else {
        sizes[i] = 0.6 + Math.random() * 0.4;
      }
      randoms[i] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSpeed: { value: 0 },
        uVelocity: { value: new THREE.Vector3(0, 0, 0) },
        uTime: { value: 0 },
        uSprintFactor: { value: 0 },
        uStreakLength: { value: cfg.streakLength || 5.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */`
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
        varying vec2 vScreenPos;

        void main() {
          vec3 pos = position;

          float speedFactor = min(uSpeed / 30.0, 4.0);

          float layerSpeed;
          if (aRandom < 0.3) {
            layerSpeed = 0.1;
            vSpeedLayer = 0.0;
          } else if (aRandom < 0.8) {
            layerSpeed = 0.4;
            vSpeedLayer = 0.5;
          } else {
            layerSpeed = 1.2;
            vSpeedLayer = 1.0;
          }

          // 微小漂浮
          float t = uTime * 0.15 * layerSpeed;
          pos.x += sin(t + aRandom * 6.28) * 0.3;
          pos.y += cos(t * 0.7 + aRandom * 6.28) * 0.3;
          pos.z += sin(t * 0.5 + aRandom * 6.28) * 0.3;

          // === 拖尾（动态长度：速度越快越长）===
          vec3 flowDir = -uVelocity;
          float dynStreak = 1.5 + speedFactor * 0.8;  // v19.5: 动态拖尾
          float flowStrength = speedFactor * 6.0 * layerSpeed;
          vec3 streakOffset = flowDir * flowStrength * aRandom * dynStreak * (1.0 + uSprintFactor * 1.5);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vec4 streakEnd = modelViewMatrix * vec4(pos + streakOffset * 0.25, 1.0);
          vec2 screenStreak = (streakEnd.xy / streakEnd.w - mvPosition.xy / mvPosition.w);
          vStreakDir = normalize(screenStreak) * length(screenStreak) * 0.2;

          // === 透明度 ===
          float baseAlpha = 0.02;
          vAlpha = baseAlpha + speedFactor * 0.12;
          vAlpha *= (0.5 + vSpeedLayer * 0.7);
          vAlpha *= (1.0 + uSprintFactor * 1.5);
          vSprint = uSprintFactor;

          // === 粒子大小 ===
          float dist = length(pos);
          float sizeBoost = 1.0 + speedFactor * 0.2 + uSprintFactor * 0.8;
          gl_PointSize = aSize * sizeBoost * uPixelRatio * (200.0 / max(dist, 1.0));
          gl_PointSize = clamp(gl_PointSize, 0.5, 12.0);
          gl_Position = projectionMatrix * mvPosition;

          // 传递归一化屏幕坐标用于中心渐隐
          vScreenPos = gl_Position.xy / gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying float vAlpha;
        varying float vSpeedLayer;
        varying float vSprint;
        varying vec2 vStreakDir;
        varying vec2 vScreenPos;

        void main() {
          vec2 coord = gl_PointCoord - 0.5;

          // 沿拖尾方向拉伸粒子
          float streakLen = length(vStreakDir);
          if (streakLen > 0.001) {
            vec2 streakAxis = normalize(vStreakDir);
            float along = dot(coord, streakAxis);
            float across = dot(coord, vec2(-streakAxis.y, streakAxis.x));
            coord = vec2(along / (1.0 + streakLen * 3.0), across * (1.0 + streakLen * 0.2));
          }

          float d = length(coord) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          float core = 1.0 - smoothstep(0.0, 0.12, d);
          alpha = max(alpha * 0.4, core * 0.35);
          alpha *= vAlpha;

          // === 中心渐隐：屏幕中心粒子降低透明度，保证视野清晰 ===
          float centerDist = length(vScreenPos);
          float centerFade = smoothstep(0.15, 0.55, centerDist); // 0→1 from center to edge
          alpha *= 0.2 + centerFade * 0.8;

          alpha = clamp(alpha, 0.0, 1.0);
          if (alpha < 0.002) discard;

          // === 颜色：速度越快越偏暖 ===
          vec3 slowColor = vec3(0.75, 0.85, 1.0);   // 冷蓝白
          vec3 fastColor = vec3(0.92, 0.88, 0.8);    // 暖白
          vec3 sprintColor = vec3(1.0, 0.7, 0.4);    // 暖金

          vec3 color = mix(slowColor, fastColor, vSprint * 0.6);
          color = mix(color, sprintColor, vSprint * vSpeedLayer * 0.4);

          // 远景偏蓝、近景偏白
          color = mix(color, vec3(1.0, 1.0, 1.0), vSpeedLayer * 0.3);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.group.add(this.points);

    console.log('[ParticleFlow] v19.1 初始化完成，粒子数:', this.count, '分布范围:', spread);
  }

  /**
   * 球形均匀分布（静止时使用）
   */
  resetParticleSphere(i, spread) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = spread * (0.2 + Math.random() * 0.8);

    this.positions[i3]     = r * Math.sin(phi) * Math.cos(theta);
    this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    this.positions[i3 + 2] = r * Math.cos(phi);
  }

  /**
   * v19: 在粒子流远端重生粒子
   * localDir 是相机局部空间的归一化移动方向
   * 粒子出生在 +localDir 方向（运动前方远处），随后沿 -localDir 流向相机并掠过
   */
  resetParticleFlow(i, spread, localDir) {
    const i3 = i * 3;

    // 粒子出生在运动方向的前方远处（+localDir）
    const forwardDist = spread * (0.4 + Math.random() * 0.6);
    // 垂直于运动方向的散布
    const perpRadius = spread * (0.1 + Math.random() * 0.5);

    // 在垂直于 localDir 的平面上随机取一个方向
    const angle = Math.random() * Math.PI * 2;
    // 构建垂直于 localDir 的基向量
    let perpX, perpY, perpZ;
    if (Math.abs(localDir.x) < 0.9) {
      const len1 = Math.sqrt(localDir.z * localDir.z + localDir.y * localDir.y);
      perpX = 0;
      perpY = -localDir.z / len1;
      perpZ = localDir.y / len1;
    } else {
      const len1 = Math.sqrt(localDir.z * localDir.z + localDir.x * localDir.x);
      perpX = localDir.z / len1;
      perpY = 0;
      perpZ = -localDir.x / len1;
    }
    const perp2X = localDir.y * perpZ - localDir.z * perpY;
    const perp2Y = localDir.z * perpX - localDir.x * perpZ;
    const perp2Z = localDir.x * perpY - localDir.y * perpX;

    const px = perpX * Math.cos(angle) + perp2X * Math.sin(angle);
    const py = perpY * Math.cos(angle) + perp2Y * Math.sin(angle);
    const pz = perpZ * Math.cos(angle) + perp2Z * Math.sin(angle);

    // 出生位置 = +localDir * 前方距离 + 垂直散布
    // 粒子随后沿 -localDir 流向相机
    this.positions[i3]     = localDir.x * forwardDist + px * perpRadius;
    this.positions[i3 + 1] = localDir.y * forwardDist + py * perpRadius;
    this.positions[i3 + 2] = localDir.z * forwardDist + pz * perpRadius;
  }

  update(delta, elapsed, speed, velocity) {
    this.speed = speed;

    // 同步跟随 group 到相机位置+朝向（group-local = camera-local）
    this.group.position.copy(this.camera.position);
    this.group.quaternion.copy(this.camera.quaternion);

    if (velocity) {
      this._worldVel.copy(velocity);
    }

    // 世界速度 → group-local 方向
    const vLen = this._worldVel.length();
    if (vLen > 0.01) {
      this._invQuat.copy(this.group.quaternion).invert();
      this._localVel.copy(this._worldVel).applyQuaternion(this._invQuat).normalize();
    } else {
      this._localVel.set(0, 0, 0);
    }

    const uniforms = this.material.uniforms;
    uniforms.uSpeed.value = speed;
    uniforms.uVelocity.value.copy(this._localVel);
    uniforms.uTime.value = elapsed;

    const maxSpd = config.player.maxSpeed;
    const sprintMul = config.player.sprintMultiplier || 3.0;
    const isSprinting = speed > maxSpd * sprintMul * 0.8;
    const targetSprint = isSprinting ? 1.0 : 0.0;
    this._sprintFactor += (targetSprint - this._sprintFactor) * Math.min(1, delta * 5);
    uniforms.uSprintFactor.value = this._sprintFactor;

    const spread = config.particleFlow?.spread || 200;
    const pos = this.positions;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      if (vLen > 0.5) {
        const flowSpeed = (speed / 40) * delta * 25;
        pos[i3]     -= this._localVel.x * flowSpeed;
        pos[i3 + 1] -= this._localVel.y * flowSpeed;
        pos[i3 + 2] -= this._localVel.z * flowSpeed;

        const dist = Math.sqrt(
          pos[i3] * pos[i3] + pos[i3 + 1] * pos[i3 + 1] + pos[i3 + 2] * pos[i3 + 2]
        );
        if (dist > spread * 1.3 || dist < 5) {
          this.resetParticleFlow(i, spread, this._localVel);
        }
      } else {
        const dist = Math.sqrt(
          pos[i3] * pos[i3] + pos[i3 + 1] * pos[i3 + 1] + pos[i3 + 2] * pos[i3 + 2]
        );
        if (dist > spread * 1.5) {
          this.resetParticleSphere(i, spread);
        }
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.group) {
      if (this.points) this.group.remove(this.points);
      if (this.group.parent) this.group.parent.remove(this.group);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}

