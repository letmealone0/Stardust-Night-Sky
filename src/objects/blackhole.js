/**
 * 黑洞系统 v12
 * 事件视界 + 吸积盘(内落) + 喷流 + 光子球 + 环境坠落粒子 + 物质流线
 * + 引力效果 + 行星潮汐瓦解吸收 + 引力透镜后处理
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

export class BlackHole {
  constructor() {
    this.group = new THREE.Group();
    this.camera = null;
    this.planetSystem = null;
    this.accretionDisk = null;
    this.diskMaterial = null;
    this.jetParticles = null;
    this.glowMaterial = null;
    this.dangerLevel = 0;
    this._tempVec = new THREE.Vector3();
    this._absorbParticles = null;
    this._infoShown = false;
    // v12: 新增
    this._infallParticles = null;    // 环境坠落粒子
    this._infallVelocities = null;   // 坠落粒子速度数组
    this._photonSphere = null;       // 光子球
    this._matterStreams = null;      // 物质流线
    this._debrisParticles = null;    // 碎片喷射
    this._debrisVelocities = null;
    this._debrisActive = false;
    this._debrisProgress = 0;
    this._diskBrightnessPulse = 0;  // 吸积盘亮度脉冲
  }

  init(scene, camera, planetSystem) {
    this.camera = camera;
    this.planetSystem = planetSystem;
    const cfg = config.blackhole;
    this.group.position.set(cfg.position.x, cfg.position.y, cfg.position.z);

    // 事件视界：纯黑球体
    const horizonGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius, 64, 64);
    const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1.0 });
    this.group.add(new THREE.Mesh(horizonGeo, horizonMat));

    // v12: 光子球（事件视界边缘发光环）
    this.createPhotonSphere(cfg);

    // 吸积盘（v12: 带内落运动）
    this.createAccretionDisk(cfg);

    // 喷流
    this.createJets(cfg);

    // 外层光晕
    this.createGlow(cfg);

    // v12: 环境坠落粒子场
    this.createInfallParticles(cfg);

    // v12: 物质流线
    this.createMatterStreams(cfg);

    // 吸收粒子（行星吸收时的螺旋流）
    this.createAbsorbParticles(cfg);

    // v12: 碎片喷射粒子
    this.createDebrisParticles(cfg);

    scene.add(this.group);
    console.log('[BlackHole] v12 黑洞系统初始化完成');
  }

  // ==================== 光子球 ====================
  createPhotonSphere(cfg) {
    const r = cfg.photonSphereRadius || cfg.eventHorizonRadius * 1.5;
    const geo = new THREE.SphereGeometry(r, 48, 48);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.6, 0.8, 1.0) },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          float rim = 1.0 - max(0.0, dot(vNormal, vec3(0,0,1)));
          float intensity = pow(rim, 4.0);
          float pulse = 0.7 + sin(uTime * 3.0) * 0.3;
          float rotate = sin(uTime * 8.0 + vNormal.x * 10.0) * 0.3 + 0.7;
          vec3 color = uColor * intensity * pulse * rotate * 2.0;
          float alpha = intensity * 0.6 * pulse;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      blending: THREE.AdditiveBlending, side: THREE.FrontSide, transparent: true, depthWrite: false,
    });
    this._photonSphere = new THREE.Mesh(geo, mat);
    this.group.add(this._photonSphere);
  }

  // ==================== 吸积盘（v12: 带内落） ====================
  createAccretionDisk(cfg) {
    const particleCount = 8000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount); // v12: 存储初始半径

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const rNorm = Math.pow(Math.random(), 0.6);
      const r = cfg.accretionInnerRadius + rNorm * (cfg.accretionOuterRadius - cfg.accretionInnerRadius);
      const height = (Math.random() - 0.5) * 4 * (1 - rNorm * 0.5);

      positions[i3] = Math.cos(angle) * r;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * r;
      radii[i] = r;

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
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1)); // v12

    this.diskMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRotationSpeed: { value: 0.15 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uInfallSpeed: { value: cfg.accretionInfallSpeed || 0.5 }, // v12
        uBrightnessPulse: { value: 0 }, // v12
        uInnerRadius: { value: cfg.accretionInnerRadius }, // v12
        uOuterRadius: { value: cfg.accretionOuterRadius }, // v12
      },
      vertexShader: `
        attribute float aRandom;
        attribute float aRadius;
        uniform float uTime;
        uniform float uRotationSpeed;
        uniform float uPixelRatio;
        uniform float uInfallSpeed;
        uniform float uBrightnessPulse;
        uniform float uInnerRadius;
        uniform float uOuterRadius;
        varying vec3 vColor;
        varying float vAlpha;

        float hash(float n) { return fract(sin(n) * 43758.5453); }

        void main() {
          vColor = color;
          vec3 pos = position;

          // 旋转动画
          float rotAngle = uTime * uRotationSpeed;
          float cosA = cos(rotAngle);
          float sinA = sin(rotAngle);
          float rx = pos.x * cosA - pos.z * sinA;
          float rz = pos.x * sinA + pos.z * cosA;
          pos.x = rx;
          pos.z = rz;

          // v12-fix5: 内落运动 — Kepler轨道：越近越快
          float dist = aRadius;
          // 基于半径的内落速度：近处快、远处慢（∝ r^(-1.5)）
          float normalizedR = (dist - uInnerRadius) / max(uOuterRadius - uInnerRadius, 1.0);
          float infallSpeed = uInfallSpeed * (2.0 + 8.0 * pow(1.0 - normalizedR, 1.5)); // 近处10倍速
          float infall = mod(uTime * infallSpeed + aRandom * 50.0, uOuterRadius - uInnerRadius);
          float currentR = uOuterRadius - infall;
          if (currentR < uInnerRadius) currentR = uOuterRadius;

          // 湍流扰动
          float turbulence = sin(uTime * 2.0 + aRandom * 20.0) * 0.3;
          turbulence += sin(uTime * 1.3 + aRandom * 15.0) * 0.2;
          float angle2 = atan(pos.z, pos.x) + turbulence / max(currentR, 1.0);
          pos.x = cos(angle2) * currentR;
          pos.z = sin(angle2) * currentR;

          // 高度脉冲
          pos.y += sin(uTime * 3.0 + aRandom * 10.0) * 0.5;

          // v12: 越靠近内缘越亮
          float distNorm = (currentR - uInnerRadius) / max(uOuterRadius - uInnerRadius, 1.0);
          vAlpha = 0.5 + (1.0 - distNorm) * 0.5 + uBrightnessPulse;
          vColor *= (1.0 + (1.0 - distNorm) * 0.5 + uBrightnessPulse * 2.0);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (1.5 + (1.0 - distNorm) * 1.5) * uPixelRatio * (200.0 / -mvPosition.z);
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
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    });

    this.accretionDisk = new THREE.Points(geometry, this.diskMaterial);
    this.accretionDisk.rotation.x = Math.PI * 0.5 + (Math.random() - 0.5) * 0.3;
    this.group.add(this.accretionDisk);
  }

  // ==================== 喷流 ====================
  createJets(cfg) {
    const jetCount = 400; // 每侧 400 个
    const positions = new Float32Array(jetCount * 2 * 3);
    const colors = new Float32Array(jetCount * 2 * 3);
    const phases = new Float32Array(jetCount * 2); // v12-fix6: 流动相位
    for (let jet = 0; jet < 2; jet++) {
      const dir = jet === 0 ? 1 : -1;
      for (let i = 0; i < jetCount; i++) {
        const idx = jet * jetCount + i;
        const i3 = idx * 3;
        const t = Math.random();
        // v12-fix6: 更窄的锥形（底窄顶稍宽）
        const r = cfg.eventHorizonRadius * 0.15 + t * cfg.eventHorizonRadius * 0.12;
        const angle = Math.random() * Math.PI * 2;
        const y = cfg.eventHorizonRadius * 1.2 + t * cfg.jetLength;
        positions[i3] = Math.cos(angle) * r;
        positions[i3 + 1] = dir * y;
        positions[i3 + 2] = Math.sin(angle) * r;
        const brightness = 1.0 - t * 0.4;
        colors[i3] = 0.35 + t * 0.35; colors[i3 + 1] = 0.55 + brightness * 0.3; colors[i3 + 2] = 1.0;
        phases[idx] = t; // 0=底部, 1=顶部
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    // v12-fix6: Shader 让粒子沿 Y 轴向外流动
    this._jetMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uJetLength: { value: cfg.jetLength },
        uEHRadius: { value: cfg.eventHorizonRadius },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aPhase;
        uniform float uTime;
        uniform float uJetLength;
        uniform float uEHRadius;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vec3 pos = position;
          // v12-fix6: 粒子沿 Y 轴向外流动（循环）
          float flow = mod(uTime * 0.8 + aPhase * 2.0, 2.0); // 0~2 循环
          float flowY = flow * uJetLength * 0.5;
          pos.y += sign(pos.y) * flowY;
          // 超出喷流长度后回到底部
          float absY = abs(pos.y);
          if (absY > uEHRadius * 1.2 + uJetLength) {
            pos.y = sign(pos.y) * uEHRadius * 1.2;
          }
          // 透明度：底部亮，顶部暗
          float t = clamp((absY - uEHRadius * 1.2) / uJetLength, 0.0, 1.0);
          vAlpha = (1.0 - t * 0.6) * 0.7;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (1.0 + (1.0 - t) * 0.5) * uPixelRatio * (200.0 / -mvPosition.z);
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
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    });
    this.jetParticles = new THREE.Points(geo, this._jetMaterial);
    this.group.add(this.jetParticles);
  }

  // ==================== 外层光晕 ====================
  createGlow(cfg) {
    const glowGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius * 4, 32, 32);
    this.glowMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.4, 0.15, 0.6) } },
      vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNormal; uniform float uTime; uniform vec3 uColor; void main() { float rim = 1.0 - max(0.0, dot(vNormal, vec3(0,0,1))); float i = pow(rim, 3.0); float p = 0.7 + sin(uTime * 0.8) * 0.3; gl_FragColor = vec4(uColor * i * p, i * 0.4 * p); }`,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    this.group.add(new THREE.Mesh(glowGeo, this.glowMaterial));
  }

  // ==================== v12: 环境坠落粒子场 ====================
  createInfallParticles(cfg) {
    const count = cfg.infallParticleCount || 2000;
    const range = cfg.infallRange || cfg.accretionOuterRadius * 2;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // v12-fix2: 从外围开始，向内坠落
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = range * (0.3 + Math.random() * 0.7);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.5; // 扁平化
      positions[i3 + 2] = r * Math.cos(phi);

      // v12-fix4: 初速度向内
      const rActual = Math.sqrt(positions[i3]**2 + positions[i3+1]**2 + positions[i3+2]**2);
      const nx = -positions[i3] / rActual, ny = -positions[i3+1] / rActual, nz = -positions[i3+2] / rActual;
      velocities[i3]     = nx * 10;
      velocities[i3 + 1] = ny * 10;
      velocities[i3 + 2] = nz * 10;

      alphas[i] = 0.5 + Math.random() * 0.5;  // 更亮
      sizes[i] = 1.0 + Math.random() * 2.0;   // 更大
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector3(0, 0, 0) },
        uEHRadius: { value: cfg.eventHorizonRadius },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        uniform vec3 uCenter;
        uniform float uEHRadius;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vDist;

        void main() {
          float dist = length(position - uCenter);
          vDist = dist;

          // 越近越亮越小
          float distNorm = clamp(dist / (uEHRadius * 8.0), 0.0, 1.0);
          vAlpha = aAlpha * (0.2 + (1.0 - distNorm) * 0.8);

          // 越近越小（物质被压缩）
          float sizeScale = 0.3 + distNorm * 0.7;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * sizeScale * uPixelRatio * (500.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha;
        varying float vDist;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha *= vAlpha;
          if (alpha < 0.01) discard;
          // 颜色：远暗红 → 中橙 → 近白蓝（与吸积盘橙色区分）
          float t = clamp(vDist / 250.0, 0.0, 1.0);
          vec3 farColor = vec3(0.6, 0.15, 0.05);  // 暗红
          vec3 midColor = vec3(1.0, 0.7, 0.2);     // 亮橙
          vec3 nearColor = vec3(1.0, 1.0, 1.0);    // 纯白（近处最亮）
          vec3 color = mix(nearColor, midColor, smoothstep(0.0, 0.3, t));
          color = mix(color, farColor, smoothstep(0.3, 1.0, t));
          // 近处额外加亮
          color *= (1.0 + (1.0 - t) * 1.5);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });

    this._infallParticles = new THREE.Points(geo, mat);
    this._infallVelocities = velocities;
    this.group.add(this._infallParticles);
  }

  // ==================== v12: 物质流线 ====================
  createMatterStreams(cfg) {
    const streamCount = cfg.matterStreamCount || 6;
    const particlesPerStream = cfg.matterStreamParticles || 80;
    const total = streamCount * particlesPerStream;
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const alphas = new Float32Array(total);

    const streams = [];
    for (let s = 0; s < streamCount; s++) {
      const baseAngle = (s / streamCount) * Math.PI * 2;
      const tiltAngle = (Math.random() - 0.5) * 0.8;
      const streamData = { baseAngle, tiltAngle, phase: Math.random() * Math.PI * 2 };
      streams.push(streamData);

      for (let p = 0; p < particlesPerStream; p++) {
        const idx = s * particlesPerStream + p;
        const i3 = idx * 3;
        const t = p / particlesPerStream; // 0=远端, 1=近端
        const r = cfg.accretionOuterRadius * 1.5 * (1 - t * 0.7);
        const angle = baseAngle + t * Math.PI * 0.5; // 弧形
        positions[i3] = Math.cos(angle) * r;
        positions[i3 + 1] = Math.sin(tiltAngle) * r * 0.2;
        positions[i3 + 2] = Math.sin(angle) * r;
        // 远暗近亮
        const brightness = 0.2 + t * 0.8;
        colors[i3] = brightness * 0.8; colors[i3 + 1] = brightness * 0.5; colors[i3 + 2] = brightness * 0.3;
        alphas[idx] = 0.1 + t * 0.6;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.PointsMaterial({
      size: 1.5, vertexColors: true, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });

    this._matterStreams = new THREE.Points(geo, mat);
    this._matterStreams.userData = { streams, particlesPerStream, animOffset: 0 };
    this.group.add(this._matterStreams);
  }

  // ==================== 吸收粒子（行星吸收事件） ====================
  createAbsorbParticles(cfg) {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      colors[i3] = 1.0; colors[i3 + 1] = 0.6; colors[i3 + 2] = 0.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this._absorbParticles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.0, vertexColors: true, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this._absorbParticles.userData = { active: false, targetPos: new THREE.Vector3(), progress: 0 };
    this.group.add(this._absorbParticles);
  }

  // ==================== v12: 碎片喷射粒子 ====================
  createDebrisParticles(cfg) {
    const count = cfg.debrisCount || 40;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      sizes[i] = 0.8 + Math.random() * 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      size: 2.0, color: 0xff8844, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this._debrisParticles = new THREE.Points(geo, mat);
    this._debrisVelocities = velocities;
    this._debrisParticles.userData = { active: false, origin: new THREE.Vector3(), progress: 0 };
    this.group.add(this._debrisParticles);
  }

  // ==================== 更新 ====================
  update(delta, elapsed) {
    const cfg = config.blackhole;
    const cm = config.celestialMotion;
    const motionScale = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;

    // 吸积盘 Shader 时间
    if (this.diskMaterial?.uniforms) {
      this.diskMaterial.uniforms.uTime.value = elapsed;
      // v12: 亮度脉冲衰减
      if (this._diskBrightnessPulse > 0) {
        this._diskBrightnessPulse *= Math.pow(0.05, delta);
        if (this._diskBrightnessPulse < 0.01) this._diskBrightnessPulse = 0;
      }
      this.diskMaterial.uniforms.uBrightnessPulse.value = this._diskBrightnessPulse;
    }

    // 喷流脉冲 (v12-fix6: Shader 驱动流动)
    if (this._jetMaterial?.uniforms) {
      this._jetMaterial.uniforms.uTime.value = elapsed;
    }

    // 光子球
    if (this._photonSphere?.material?.uniforms) this._photonSphere.material.uniforms.uTime.value = elapsed;

    // 光晕
    if (this.glowMaterial) this.glowMaterial.uniforms.uTime.value = elapsed;

    // v12: 黑洞自转
    this.group.rotation.y += (cfg.selfRotationSpeed || 1.5) * delta * motionScale;

    // v12: 环境坠落粒子
    this.updateInfallParticles(cfg, delta, motionScale);

    // v12: 物质流线动画
    this.updateMatterStreams(cfg, delta, elapsed, motionScale);

    // v12: 碎片粒子
    this.updateDebris(cfg, delta);

    // 引力 + 重生 + 信息
    if (this.camera) {
      const dist = this.group.position.distanceTo(this.camera.position);
      if (dist > cfg.respawnDistance) {
        this.respawn(cfg);
        this.dangerLevel = 0;
      } else if (dist < cfg.dangerRadius) {
        this.dangerLevel = Math.max(0, Math.min(1, 1.0 - (dist - cfg.pullRadius) / (cfg.dangerRadius - cfg.pullRadius)));
        if (cfg.gravityEnabled !== false && dist < cfg.pullRadius && dist > cfg.eventHorizonRadius * 2) {
          const pullForce = (1 - dist / cfg.pullRadius) * cfg.pullStrength * delta;
          this._tempVec.subVectors(this.group.position, this.camera.position).normalize();
          this.camera.position.addScaledVector(this._tempVec, pullForce);
        }
      } else {
        this.dangerLevel = 0;
      }
      if (dist < (cfg.infoDistance || 800)) {
        this._showInfo(cfg, dist);
      } else if (this._infoShown) {
        const hud = window.engine?.hud;
        if (hud) hud.hideCelestialInfo();
        this._infoShown = false;
      }
    }

    // 行星吸收
    this.updatePlanetAbsorption(cfg, delta, elapsed);
  }

  // ==================== v12: 坠落粒子更新 ====================
  updateInfallParticles(cfg, delta, motionScale) {
    if (!this._infallParticles) return;
    const pos = this._infallParticles.geometry.attributes.position.array;
    const vel = this._infallVelocities;
    const count = pos.length / 3;
    const ehR = cfg.eventHorizonRadius;
    const range = cfg.infallRange || cfg.accretionOuterRadius * 2;
    const dt = delta * motionScale;
    const ehCheck = ehR * 1.5; // 粒子非常接近事件视界才消失

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      if (dist < ehCheck || dist > range * 2 || dist < 0.5) {
        this._respawnInfallParticle(i, cfg, pos, vel);
        continue;
      }

      const nx = -x / dist, ny = -y / dist, nz = -z / dist;

      // v12-fix5: 直线坠入 — 速度直接指向黑洞中心，加随机扰动
      // 速度 ∝ 1/√r，越近越快
      const baseSpeed = 8 + 150 * Math.sqrt(ehR / dist); // 8~158
      // 随机扰动（不规则轨迹，防止完美直线）
      const jitter = 0.15;
      const jx = (Math.random() - 0.5) * jitter * baseSpeed;
      const jy = (Math.random() - 0.5) * jitter * baseSpeed;
      const jz = (Math.random() - 0.5) * jitter * baseSpeed;

      vel[i3]     = nx * baseSpeed + jx;
      vel[i3 + 1] = ny * baseSpeed + jy;
      vel[i3 + 2] = nz * baseSpeed + jz;

      // 更新位置
      pos[i3]     += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
    }
    this._infallParticles.geometry.attributes.position.needsUpdate = true;
  }

  _respawnInfallParticle(i, cfg, pos, vel) {
    const i3 = i * 3;
    const range = cfg.infallRange || cfg.accretionOuterRadius * 2;
    // 重生在外围
    const r = range * (0.5 + Math.random() * 0.5);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.4;
    pos[i3 + 2] = r * Math.cos(phi);
    // 初速度向内
    const nx = -pos[i3] / r, ny = -pos[i3 + 1] / r, nz = -pos[i3 + 2] / r;
    vel[i3]     = nx * 10;
    vel[i3 + 1] = ny * 10;
    vel[i3 + 2] = nz * 10;
  }

  // ==================== v12: 物质流线更新 ====================
  updateMatterStreams(cfg, delta, elapsed, motionScale) {
    if (!this._matterStreams) return;
    const data = this._matterStreams.userData;
    data.animOffset += delta * 0.5 * motionScale;

    const pos = this._matterStreams.geometry.attributes.position.array;
    const alphas = this._matterStreams.geometry.attributes.aAlpha.array;
    const ppS = data.particlesPerStream;

    data.streams.forEach((stream, s) => {
      for (let p = 0; p < ppS; p++) {
        const idx = s * ppS + p;
        const i3 = idx * 3;
        const t = ((p / ppS + data.animOffset) % 1.0); // 流动
        const r = cfg.accretionOuterRadius * 1.5 * (1 - t * 0.7);
        const angle = stream.baseAngle + t * Math.PI * 0.5 + elapsed * 0.05 * motionScale;
        pos[i3] = Math.cos(angle) * r;
        pos[i3 + 1] = Math.sin(stream.tiltAngle) * r * 0.2;
        pos[i3 + 2] = Math.sin(angle) * r;
        alphas[idx] = 0.05 + t * 0.5;
      }
    });
    this._matterStreams.geometry.attributes.position.needsUpdate = true;
    this._matterStreams.geometry.attributes.aAlpha.needsUpdate = true;
  }

  // ==================== v12: 碎片更新 ====================
  updateDebris(cfg, delta) {
    if (!this._debrisParticles || !this._debrisParticles.userData.active) return;
    const data = this._debrisParticles.userData;
    data.progress += delta * 1.5;
    const pos = this._debrisParticles.geometry.attributes.position.array;
    const vel = this._debrisVelocities;
    const count = pos.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // 先向外喷射（0~0.3），然后被拉回（0.3~1.0）
      const t = data.progress;
      if (t < 0.3) {
        // 向外喷射
        pos[i3] += vel[i3] * delta * 3;
        pos[i3 + 1] += vel[i3 + 1] * delta * 3;
        pos[i3 + 2] += vel[i3 + 2] * delta * 3;
      } else {
        // 被引力拉回黑洞中心
        const dx = data.origin.x - pos[i3] + this.group.position.x;
        const dy = data.origin.y - pos[i3 + 1] + this.group.position.y;
        const dz = data.origin.z - pos[i3 + 2] + this.group.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
        const pull = cfg.infallGravity * 2 / (dist * dist);
        vel[i3] += (dx / dist) * pull * delta;
        vel[i3 + 1] += (dy / dist) * pull * delta;
        vel[i3 + 2] += (dz / dist) * pull * delta;
        pos[i3] += vel[i3] * delta;
        pos[i3 + 1] += vel[i3 + 1] * delta;
        pos[i3 + 2] += vel[i3 + 2] * delta;
      }
    }
    this._debrisParticles.geometry.attributes.position.needsUpdate = true;
    this._debrisParticles.material.opacity = Math.max(0, 1 - data.progress * 0.8);

    if (data.progress > 1.5) {
      this._debrisParticles.userData.active = false;
      this._debrisParticles.material.opacity = 0;
    }
  }

  // ==================== 后处理 ====================
  updatePostEffects(uniforms, camera) {
    const cfg = config.blackhole;
    if (!camera || !this.group) return;
    const dist = this.group.position.distanceTo(camera.position);
    const lensingRange = cfg.distorionRadius || 600;
    if (dist < lensingRange && this.dangerLevel > 0) {
      this._tempVec.copy(this.group.position).project(camera);
      const screenX = (this._tempVec.x + 1) * 0.5;
      const screenY = (this._tempVec.y + 1) * 0.5;
      if (screenX > -0.1 && screenX < 1.1 && screenY > -0.1 && screenY < 1.1) {
        uniforms.uLensCenter.value.set(screenX, screenY);
        uniforms.uLensStrength.value = (cfg.lensingStrength || 0.35) * this.dangerLevel;
        uniforms.uLensRadius.value = 0.15 + this.dangerLevel * 0.15;
      } else { uniforms.uLensStrength.value = 0; }
    } else { uniforms.uLensStrength.value = 0; }
  }

  // ==================== 行星吸收（v12: 潮汐瓦解增强） ====================
  updatePlanetAbsorption(cfg, delta, elapsed) {
    if (!this.planetSystem) return;
    const planets = this.planetSystem.getPlanets();
    const bhPos = this.group.position;
    const stretchFactor = cfg.tidalStretchFactor || 3.0;

    for (let i = planets.length - 1; i >= 0; i--) {
      const planet = planets[i];
      const dist = bhPos.distanceTo(planet.position);
      if (dist < cfg.absorbRadius) {
        const data = planet.userData;
        if (!data.beingAbsorbed) {
          data.beingAbsorbed = true;
          data.absorbProgress = 0;
          data.originalScale = planet.scale.x;
          // v12: 激活碎片喷射
          this._activateDebris(planet.position);
        }
        data.absorbProgress += delta * 0.5;
        const shrink = Math.max(0, 1 - data.absorbProgress);
        // v12: 潮汐拉伸 — 一个轴拉长
        const stretch = 1 + data.absorbProgress * stretchFactor;
        planet.scale.set(data.originalScale * shrink, data.originalScale * shrink * stretch, data.originalScale * shrink);
        // 面向黑洞方向旋转拉伸轴
        const dir = new THREE.Vector3().subVectors(bhPos, planet.position).normalize();
        planet.lookAt(bhPos);
        // 颜色偏移
        planet.traverse((child) => {
          if (child.material?.emissive) child.material.emissive.lerp(new THREE.Color(0.5, 0.1, 0.0), delta * 2);
        });
        // 激活吸收粒子
        if (this._absorbParticles && !this._absorbParticles.userData.active) {
          this._absorbParticles.userData.active = true;
          this._absorbParticles.userData.targetPos.copy(planet.position);
          this._absorbParticles.userData.progress = 0;
        }
        // 完全吸收
        if (data.absorbProgress >= 1.0) {
          // v12: 吸积盘亮度脉冲
          this._diskBrightnessPulse = 1.0;
          if (planet.parent) planet.parent.remove(planet);
          planet.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) { if (child.material.map) child.material.map.dispose(); child.material.dispose(); }
          });
          planets.splice(i, 1);
          if (this._absorbParticles) this._absorbParticles.userData.active = false;
        }
      }
    }
    if (this._absorbParticles?.userData.active) this.updateAbsorbParticles(cfg, delta, elapsed);
  }

  _activateDebris(origin) {
    if (!this._debrisParticles) return;
    const data = this._debrisParticles.userData;
    data.active = true;
    data.progress = 0;
    data.origin.copy(origin);
    const pos = this._debrisParticles.geometry.attributes.position.array;
    const vel = this._debrisVelocities;
    const count = pos.length / 3;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // 从行星位置开始
      pos[i3] = origin.x - this.group.position.x;
      pos[i3 + 1] = origin.y - this.group.position.y;
      pos[i3 + 2] = origin.z - this.group.position.z;
      // 向外随机速度
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 20 + Math.random() * 40;
      vel[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      vel[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      vel[i3 + 2] = Math.cos(phi) * speed;
    }
    this._debrisParticles.material.opacity = 1.0;
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
      pos[i3] = data.targetPos.x - this.group.position.x + Math.cos(angle) * radius;
      pos[i3 + 1] = data.targetPos.y - this.group.position.y + (1 - t) * 20 * Math.sin(t * Math.PI);
      pos[i3 + 2] = data.targetPos.z - this.group.position.z + Math.sin(angle) * radius;
    }
    this._absorbParticles.geometry.attributes.position.needsUpdate = true;
    this._absorbParticles.material.opacity = Math.max(0, 1 - data.progress * 0.5);
  }

  respawn(cfg) {
    const camPos = this.camera.position;
    const chunkX = Math.round(camPos.x / 2000), chunkY = Math.round(camPos.y / 2000), chunkZ = Math.round(camPos.z / 2000);
    const seed = hashCoords(chunkX * 31 + 17, chunkY * 37 + 23, chunkZ * 41 + 29);
    const rng = seededRandom(seed);
    const theta = rng() * Math.PI * 2, phi = Math.acos(2 * rng() - 1);
    const r = cfg.respawnMin + rng() * (cfg.respawnMax - cfg.respawnMin);
    this.group.position.set(camPos.x + r * Math.sin(phi) * Math.cos(theta), camPos.y + r * Math.sin(phi) * Math.sin(theta) * 0.3, camPos.z + r * Math.cos(phi));
    this.dangerLevel = 0;
  }

  _showInfo(cfg, dist) {
    const hud = window.engine?.hud;
    if (!hud) return;
    this._infoShown = true;
    hud.showCelestialInfo('黑洞', 'Stellar Black Hole', [
      `事件视界: ${cfg.eventHorizonRadius} AU`, `吸积盘: ${cfg.accretionInnerRadius}~${cfg.accretionOuterRadius} AU`,
      `引力范围: ${cfg.pullRadius} AU`, `距离: ${dist.toFixed(0)} AU`,
    ].join('<br>'));
  }

  getDangerLevel() { return this.dangerLevel; }

  dispose(scene) {
    scene.remove(this.group);
    this.group.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}
