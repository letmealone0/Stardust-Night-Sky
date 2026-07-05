/**
 * 黑洞系统 v13 — 真实物理黑洞渲染
 * 橙黄温度梯度吸积盘 + 引力透镜 + 纯黑事件视界 + 螺旋坠落粒子
 * + 引力效果 + 行星潮汐瓦解吸收 + 引力透镜后处理
 *
 * v13 核心改进：
 * - 吸积盘配色：内白→中金→外暗红，温度梯度，彻底去紫
 * - 吸积盘形态：厚度压缩至1/3，外薄内厚，35°倾斜呈现立体薄盘
 * - 光子球：事件视界外极细亮环，非球面发光
 * - 外层光晕：暖橙黄微光，透明度-60%，不抢主体
 * - 事件视界：绝对纯黑、不透明、无反射
 * - 引力透镜：强度+50%，范围+40%，中等距离即见环形拉伸
 * - 吸积盘动态：内圈5-8倍速差，螺旋内落，粒子近内缘消失
 * - 坠落粒子：螺旋轨道下落，近心角速度↑亮度↑尺寸↓
 * - 喷流：亮度×2+长度×1.5，底部亮顶暗，暖色高速流动
 * - 所有动画×delta帧率解耦
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
    this._infallParticles = null;
    this._infallVelocities = null;
    this._photonSphere = null;
    this._matterStreams = null;
    this._debrisParticles = null;
    this._debrisVelocities = null;
    this._debrisActive = false;
    this._debrisProgress = 0;
    this._diskBrightnessPulse = 0;
  }

  init(scene, camera, planetSystem) {
    this.camera = camera;
    this.planetSystem = planetSystem;
    const cfg = config.blackhole;
    this.group.position.set(cfg.position.x, cfg.position.y, cfg.position.z);

    // 1. 事件视界：绝对纯黑球体（最深沉的黑色）
    const horizonGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius, 64, 64);
    const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.group.add(new THREE.Mesh(horizonGeo, horizonMat));

    // 2. v13: 光子球 → 极细亮环（非球面）
    this.createPhotonSphere(cfg);

    // 3. v13: 吸积盘（橙黄温度梯度 + 35°倾斜 + 1/3厚度）
    this.createAccretionDisk(cfg);

    // 4. v13: 喷流（暖色 + 亮度×2 + 长度×1.5）
    this.createJets(cfg);

    // 5. v13: 外层光晕（暖橙微光，透明度-60%）
    this.createGlow(cfg);

    // 6. v13: 环境螺旋坠落粒子
    this.createInfallParticles(cfg);

    // 7. 物质流线
    this.createMatterStreams(cfg);

    // 8. 吸收粒子
    this.createAbsorbParticles(cfg);

    // 9. 碎片喷射
    this.createDebrisParticles(cfg);

    scene.add(this.group);
    console.log('[BlackHole] v13 真实黑洞渲染初始化完成');
  }

  // ==================== v13: 光子球 → 极细亮环 ====================
  createPhotonSphere(cfg) {
    const r = cfg.photonSphereRadius || cfg.eventHorizonRadius * 1.5;
    // v13: 用 Torus 替代球体，形成纤细光环
    const torusGeo = new THREE.TorusGeometry(r, cfg.eventHorizonRadius * 0.08, 16, 128);
    const torusMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1.0, 0.85, 0.6) }, // 暖白
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          // v13: 仅边缘可见（极细环），正面不可见
          float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
          float ring = pow(rim, 8.0);
          float pulse = 0.8 + sin(uTime * 4.0) * 0.2;
          float a = ring * 0.7 * pulse;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor * ring * pulse * 2.5, a);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false,
    });
    this._photonSphere = new THREE.Mesh(torusGeo, torusMat);
    // v13: 环随机倾斜，不完全在吸积盘平面
    this._photonSphere.rotation.x = Math.PI * 0.5 + (Math.random() - 0.5) * 0.2;
    this._photonSphere.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(this._photonSphere);
  }

  // ==================== v13: 吸积盘（橙黄温度梯度+薄盘+螺旋内落） ====================
  createAccretionDisk(cfg) {
    const particleCount = 10000; // v13: 增加到10000
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount);

    const innerR = cfg.accretionInnerRadius;
    const outerR = cfg.accretionOuterRadius;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      // v13: 更多粒子分布在内圈（密度 ∝ 1/r）
      const rNorm = Math.pow(Math.random(), 0.4);
      const r = innerR + rNorm * (outerR - innerR);
      // v13: 厚度压缩至原来的1/3，外圈更薄
      const thickness = 1.2 * (1 - rNorm * 0.6);
      const height = (Math.random() - 0.5) * thickness;

      positions[i3] = Math.cos(angle) * r;
      positions[i3 + 1] = height;
      positions[i3 + 2] = Math.sin(angle) * r;
      radii[i] = r;

      // v13: 温度梯度：内白→中金→外暗红（严格物理色调）
      const t = rNorm;
      let cr, cg, cb;
      if (t < 0.15) {
        // 内圈：亮白（~10000K）
        cr = 0.95 + Math.random() * 0.05; cg = 0.9 + Math.random() * 0.1; cb = 0.7 + Math.random() * 0.2;
      } else if (t < 0.4) {
        // 中内圈：金黄（~5000K）
        cr = 1.0; cg = 0.6 + Math.random() * 0.3; cb = 0.1 + Math.random() * 0.15;
      } else if (t < 0.7) {
        // 中外圈：橙色（~3000K）
        cr = 0.8 + Math.random() * 0.2; cg = 0.25 + Math.random() * 0.2; cb = 0.02 + Math.random() * 0.05;
      } else {
        // 外圈：暗红（~1500K）
        cr = 0.4 + Math.random() * 0.25; cg = 0.05 + Math.random() * 0.08; cb = 0.01 + Math.random() * 0.02;
      }
      colors[i3] = cr; colors[i3 + 1] = cg; colors[i3 + 2] = cb;
      randoms[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));

    this.diskMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uInfallSpeed: { value: cfg.accretionInfallSpeed || 3.0 },
        uBrightnessPulse: { value: 0 },
        uInnerRadius: { value: innerR },
        uOuterRadius: { value: outerR },
        uEventHorizonR: { value: cfg.eventHorizonRadius },
      },
      vertexShader: `
        attribute float aRandom;
        attribute float aRadius;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uInfallSpeed;
        uniform float uBrightnessPulse;
        uniform float uInnerRadius;
        uniform float uOuterRadius;
        uniform float uEventHorizonR;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDistNorm;

        void main() {
          vColor = color;
          vec3 pos = position;

          // v13: 差速旋转 — 内圈5-8倍速（Kepler ω∝r^(-1.5)）
          float rNorm = (aRadius - uInnerRadius) / max(uOuterRadius - uInnerRadius, 1.0);
          float orbitalSpeed = 0.15 / pow(rNorm + 0.06, 1.5);
          float rotAngle = uTime * orbitalSpeed;
          float ca = cos(rotAngle), sa = sin(rotAngle);
          float rx = pos.x * ca - pos.z * sa;
          float rz = pos.x * sa + pos.z * ca;
          pos.x = rx; pos.z = rz;

          // v13: 螺旋内落 — 粒子缓慢向内迁移，到达内缘后重生
          float infallT = mod(uTime * uInfallSpeed * 0.08 + aRandom * 3.0, 1.0);
          float currentR = uOuterRadius - (uOuterRadius - uInnerRadius) * infallT;
          // 近内缘加速内落
          float accelFactor = 1.0 + 3.0 * pow(1.0 - infallT, 2.0);
          currentR = uOuterRadius - (uOuterRadius - uInnerRadius) * min(infallT * accelFactor, 1.0);
          currentR = max(currentR, uInnerRadius * 1.02);
          float angle2 = atan(pos.z, pos.x);
          pos.x = cos(angle2) * currentR;
          pos.z = sin(angle2) * currentR;

          // 高度微扰
          pos.y += sin(uTime * 3.0 + aRandom * 10.0) * 0.3 * (1.0 - rNorm);

          // v13: 亮度指数衰减（内亮外暗），近内缘加亮
          float distFactor = clamp((currentR - uInnerRadius) / (uOuterRadius - uInnerRadius), 0.0, 1.0);
          vDistNorm = distFactor;
          // 中心最亮，向外指数衰减
          float brightness = exp(-distFactor * 2.5) * 1.2;
          // 接近事件视界：额外增亮
          brightness += exp(-distFactor * 8.0) * 0.8;
          brightness += uBrightnessPulse * exp(-distFactor * 3.0);
          vAlpha = clamp(brightness * (0.6 + 0.4 * (1.0 - distFactor)), 0.0, 1.0);
          vColor *= brightness;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          // v13: 内圈粒子更小更亮（模拟物质压缩）
          float size = 1.2 + (1.0 - distFactor) * 0.6;
          gl_PointSize = size * uPixelRatio * (220.0 / max(-mvPosition.z, 1.0));
          gl_PointSize = clamp(gl_PointSize, 0.8, 12.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDistNorm;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          // v13: 极柔光斑
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha = pow(alpha, 0.6);
          alpha *= vAlpha;
          if (alpha < 0.008) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });

    this.accretionDisk = new THREE.Points(geometry, this.diskMaterial);
    // v13: 35°倾斜（不正面镜头，呈现薄盘立体感）
    this.accretionDisk.rotation.x = Math.PI * 0.5 + 0.61;
    // 随机方位角
    this.accretionDisk.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(this.accretionDisk);
  }

  // ==================== v13: 喷流（暖色 + 亮度×2 + 长度×1.5） ====================
  createJets(cfg) {
    const jetCount = 600; // 每侧600个（增加）
    const totalCount = jetCount * 2;
    const positions = new Float32Array(totalCount * 3);
    const colors = new Float32Array(totalCount * 3);
    const phases = new Float32Array(totalCount);
    const jetLen = cfg.jetLength * 1.5; // v13: 长度+50%

    for (let jet = 0; jet < 2; jet++) {
      const dir = jet === 0 ? 1 : -1;
      for (let i = 0; i < jetCount; i++) {
        const idx = jet * jetCount + i;
        const i3 = idx * 3;
        const t = Math.random();
        const r = cfg.eventHorizonRadius * 0.12 + t * cfg.eventHorizonRadius * 0.1;
        const angle = Math.random() * Math.PI * 2;
        const y = cfg.eventHorizonRadius * 1.1 + t * jetLen;
        positions[i3] = Math.cos(angle) * r;
        positions[i3 + 1] = dir * y;
        positions[i3 + 2] = Math.sin(angle) * r;
        // v13: 暖色喷流（底亮白→中金黄→顶暗橙）
        const brightness = 1.0 - t * 0.5;
        if (t < 0.2) {
          colors[i3] = 0.95; colors[i3 + 1] = 0.85; colors[i3 + 2] = 0.55;
        } else if (t < 0.6) {
          colors[i3] = 0.9; colors[i3 + 1] = 0.55; colors[i3 + 2] = 0.1;
        } else {
          colors[i3] = 0.5; colors[i3 + 1] = 0.2; colors[i3 + 2] = 0.03;
        }
        phases[idx] = t;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this._jetMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uJetLength: { value: jetLen },
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
          // v13: 高速向外流动（速度×2）
          float flow = mod(uTime * 1.6 + aPhase * 2.0, 2.0);
          float flowY = flow * uJetLength * 0.5;
          pos.y += sign(pos.y) * flowY;
          float absY = abs(pos.y);
          if (absY > uEHRadius * 1.1 + uJetLength) {
            pos.y = sign(pos.y) * uEHRadius * 1.1;
          }
          float t = clamp((absY - uEHRadius * 1.1) / uJetLength, 0.0, 1.0);
          // v13: 底部亮度×2
          vAlpha = (1.0 - t * 0.7) * 0.9;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (1.2 + (1.0 - t) * 0.8) * uPixelRatio * (250.0 / max(-mvPosition.z, 1.0));
          gl_PointSize = clamp(gl_PointSize, 1.0, 18.0);
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
          alpha = pow(alpha, 0.55);
          alpha *= vAlpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor * 1.2, alpha);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });
    this.jetParticles = new THREE.Points(geo, this._jetMaterial);
    this.group.add(this.jetParticles);
  }

  // ==================== v13: 外层光晕（暖橙微光，透明度-60%） ====================
  createGlow(cfg) {
    const glowGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius * 3.5, 32, 32);
    this.glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1.0, 0.55, 0.15) }, // 暖橙
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
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
          float rim = 1.0 - max(0.0, abs(dot(vNormal, viewDir)));
          // v13: 极柔和的外层微光，不抢吸积盘主体
          float intensity = pow(rim, 5.0);
          float pulse = 0.85 + sin(uTime * 0.5) * 0.15;
          float alpha = intensity * 0.15 * pulse; // v22: 0.4 → 0.15（-62%）
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(uColor * intensity * pulse * 0.8, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    this.group.add(new THREE.Mesh(glowGeo, this.glowMaterial));
  }

  // ==================== v13: 环境螺旋坠落粒子 ====================
  createInfallParticles(cfg) {
    const count = cfg.infallParticleCount || 2000;
    const range = cfg.infallRange || cfg.accretionOuterRadius * 2;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3); // v13: [径向速度, 切向速度, 轨道角]
    const alphas = new Float32Array(count);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = range * (0.3 + Math.random() * 0.7);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.4;
      positions[i3 + 2] = r * Math.cos(phi);

      // v13: 存储 [径向速度, 切向速度, 当前角位置]
      velocities[i3] = 0;     // 径向速度（每帧更新）
      velocities[i3 + 1] = 0; // 切向速度
      velocities[i3 + 2] = Math.atan2(positions[i3 + 2], positions[i3]); // 轨道角

      alphas[i] = 0.5 + Math.random() * 0.5;
      sizes[i] = 1.0 + Math.random() * 2.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uEHRadius: { value: cfg.eventHorizonRadius },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        uniform float uEHRadius;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vDist;

        void main() {
          float dist = length(position);
          vDist = dist;
          float distNorm = clamp(dist / (uEHRadius * 10.0), 0.0, 1.0);
          // 越近越亮越小（物质被压缩加热）
          vAlpha = aAlpha * (0.15 + (1.0 - distNorm) * 0.85);
          float sizeScale = 0.25 + distNorm * 0.75;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * sizeScale * uPixelRatio * (600.0 / max(-mvPosition.z, 1.0));
          gl_PointSize = clamp(gl_PointSize, 0.8, 15.0);
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
          alpha = pow(alpha, 0.6);
          alpha *= vAlpha;
          if (alpha < 0.008) discard;
          // v13: 颜色：近白→中金→远暗红
          float t = clamp(vDist / 300.0, 0.0, 1.0);
          vec3 nearColor = vec3(1.0, 1.0, 0.9);     // 近白
          vec3 midColor  = vec3(1.0, 0.65, 0.15);    // 金黄
          vec3 farColor  = vec3(0.5, 0.08, 0.02);    // 暗红
          vec3 color = mix(nearColor, midColor, smoothstep(0.0, 0.35, t));
          color = mix(color, farColor, smoothstep(0.35, 1.0, t));
          color *= (1.0 + (1.0 - t) * 2.0);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._infallParticles = new THREE.Points(geo, mat);
    this._infallVelocities = velocities;
    this.group.add(this._infallParticles);
  }

  // ==================== 物质流线（保持不变） ====================
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
      streams.push({ baseAngle, tiltAngle, phase: Math.random() * Math.PI * 2 });

      for (let p = 0; p < particlesPerStream; p++) {
        const idx = s * particlesPerStream + p;
        const i3 = idx * 3;
        const t = p / particlesPerStream;
        const r = cfg.accretionOuterRadius * 1.5 * (1 - t * 0.7);
        const angle = baseAngle + t * Math.PI * 0.5;
        positions[i3] = Math.cos(angle) * r;
        positions[i3 + 1] = Math.sin(tiltAngle) * r * 0.2;
        positions[i3 + 2] = Math.sin(angle) * r;
        const brightness = 0.2 + t * 0.8;
        // v13: 暖色流线
        colors[i3] = brightness * 1.0; colors[i3 + 1] = brightness * 0.55; colors[i3 + 2] = brightness * 0.15;
        alphas[idx] = 0.1 + t * 0.5;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.PointsMaterial({
      size: 1.5, vertexColors: true, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });

    this._matterStreams = new THREE.Points(geo, mat);
    this._matterStreams.userData = { streams, particlesPerStream, animOffset: 0 };
    this.group.add(this._matterStreams);
  }

  // ==================== 吸收粒子 ====================
  createAbsorbParticles(cfg) {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      colors[i3] = 1.0; colors[i3 + 1] = 0.55; colors[i3 + 2] = 0.1;
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

  // ==================== 碎片喷射 ====================
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
      size: 2.0, color: 0xff6622, transparent: true, opacity: 0,
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
    const dt = Math.min(delta, 0.1);

    // 吸积盘 Shader 时间
    if (this.diskMaterial?.uniforms) {
      this.diskMaterial.uniforms.uTime.value = elapsed;
      if (this._diskBrightnessPulse > 0) {
        this._diskBrightnessPulse *= Math.exp(-3.0 * dt);
        if (this._diskBrightnessPulse < 0.01) this._diskBrightnessPulse = 0;
      }
      this.diskMaterial.uniforms.uBrightnessPulse.value = this._diskBrightnessPulse;
    }

    // 喷流
    if (this._jetMaterial?.uniforms) this._jetMaterial.uniforms.uTime.value = elapsed;

    // 光子球
    if (this._photonSphere?.material?.uniforms) this._photonSphere.material.uniforms.uTime.value = elapsed;

    // 光晕
    if (this.glowMaterial) this.glowMaterial.uniforms.uTime.value = elapsed;

    // v13: 黑洞自转 × delta（帧率解耦）
    this.group.rotation.y += (cfg.selfRotationSpeed || 1.5) * dt * motionScale;

    // v13: 螺旋坠落粒子
    this.updateInfallParticles(cfg, dt, elapsed, motionScale);

    // 物质流线
    this.updateMatterStreams(cfg, dt, elapsed, motionScale);

    // 碎片
    this.updateDebris(cfg, dt);

    // 引力 + 重生 + 信息
    if (this.camera) {
      const dist = this.group.position.distanceTo(this.camera.position);
      if (dist > cfg.respawnDistance) {
        this.respawn(cfg);
        this.dangerLevel = 0;
      } else if (dist < cfg.dangerRadius) {
        this.dangerLevel = Math.max(0, Math.min(1, 1.0 - (dist - cfg.pullRadius) / (cfg.dangerRadius - cfg.pullRadius)));
        if (cfg.gravityEnabled !== false && dist < cfg.pullRadius && dist > cfg.eventHorizonRadius * 2) {
          const pullForce = (1 - dist / cfg.pullRadius) * cfg.pullStrength * dt;
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
    this.updatePlanetAbsorption(cfg, dt, elapsed);
  }

  // ==================== v13: 螺旋坠落粒子更新 ====================
  updateInfallParticles(cfg, dt, elapsed, motionScale) {
    if (!this._infallParticles) return;
    const pos = this._infallParticles.geometry.attributes.position.array;
    const vel = this._infallVelocities; // [径向速度, 切向速度, 轨道角]
    const count = pos.length / 3;
    const ehR = cfg.eventHorizonRadius;
    const range = cfg.infallRange || cfg.accretionOuterRadius * 2;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      if (dist < ehR * 1.2 || dist > range * 2 || dist < 0.3) {
        this._respawnInfallParticle(i, cfg, pos, vel);
        continue;
      }

      // v13: 螺旋轨道 — 径向内落 + 切向旋转
      const nx = -x / dist, ny = -y / dist, nz = -z / dist;
      // 径向速度：越近越快（自由落体 ∝ 1/sqrt(r)）
      const radialSpeed = 15 + 200 * Math.sqrt(ehR / dist);
      // 切向速度：越近越快（角动量守恒 ∝ 1/r），但到达一定半径后消失
      const tangentialSpeed = radialSpeed * 0.35 * Math.min(1.0, dist / (ehR * 3));
      // 切向方向（在 XZ 平面内垂直于径向）
      const tx = -nz, tz = nx;

      // 确定性抖动
      const seed = i * 0.123 + elapsed * 0.5;
      const jitter = 0.12;
      const jx = (Math.sin(seed * 127.1) + Math.sin(seed * 311.7)) * 0.5 * jitter * radialSpeed;
      const jy = (Math.sin(seed * 74.7 + 50) + Math.sin(seed * 183.3 + 50)) * 0.5 * jitter * radialSpeed * 0.4;
      const jz = (Math.sin(seed * 269.5 + 100) + Math.sin(seed * 437.5 + 100)) * 0.5 * jitter * radialSpeed;

      // 合成速度
      vel[i3]     = nx * radialSpeed + tx * tangentialSpeed + jx;
      vel[i3 + 1] = ny * radialSpeed * 0.25 + jy;
      vel[i3 + 2] = nz * radialSpeed + tz * tangentialSpeed + jz;

      // 更新位置（×dt 帧率解耦）
      pos[i3]     += vel[i3] * dt * motionScale;
      pos[i3 + 1] += vel[i3 + 1] * dt * motionScale;
      pos[i3 + 2] += vel[i3 + 2] * dt * motionScale;
    }
    this._infallParticles.geometry.attributes.position.needsUpdate = true;
  }

  _respawnInfallParticle(i, cfg, pos, vel) {
    const i3 = i * 3;
    const range = cfg.infallRange || cfg.accretionOuterRadius * 2;
    const r = range * (0.5 + Math.random() * 0.5);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.4;
    pos[i3 + 2] = r * Math.cos(phi);
    vel[i3] = 0; vel[i3 + 1] = 0; vel[i3 + 2] = 0;
  }

  // ==================== 物质流线更新（v13: delta解耦） ====================
  updateMatterStreams(cfg, dt, elapsed, motionScale) {
    if (!this._matterStreams) return;
    const data = this._matterStreams.userData;
    data.animOffset += dt * 0.5 * motionScale;

    const pos = this._matterStreams.geometry.attributes.position.array;
    const alphas = this._matterStreams.geometry.attributes.aAlpha.array;
    const ppS = data.particlesPerStream;

    data.streams.forEach((stream, s) => {
      for (let p = 0; p < ppS; p++) {
        const idx = s * ppS + p;
        const i3 = idx * 3;
        const t = ((p / ppS + data.animOffset) % 1.0);
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

  // ==================== 碎片更新（v13: delta解耦） ====================
  updateDebris(cfg, dt) {
    if (!this._debrisParticles || !this._debrisParticles.userData.active) return;
    const data = this._debrisParticles.userData;
    data.progress += dt * 1.5;
    const pos = this._debrisParticles.geometry.attributes.position.array;
    const vel = this._debrisVelocities;
    const count = pos.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const t = data.progress;
      if (t < 0.3) {
        pos[i3] += vel[i3] * dt * 3;
        pos[i3 + 1] += vel[i3 + 1] * dt * 3;
        pos[i3 + 2] += vel[i3 + 2] * dt * 3;
      } else {
        const dx = data.origin.x - pos[i3] + this.group.position.x;
        const dy = data.origin.y - pos[i3 + 1] + this.group.position.y;
        const dz = data.origin.z - pos[i3 + 2] + this.group.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
        const pull = cfg.infallGravity * 2 / (dist * dist);
        vel[i3] += (dx / dist) * pull * dt;
        vel[i3 + 1] += (dy / dist) * pull * dt;
        vel[i3 + 2] += (dz / dist) * pull * dt;
        pos[i3] += vel[i3] * dt;
        pos[i3 + 1] += vel[i3 + 1] * dt;
        pos[i3 + 2] += vel[i3 + 2] * dt;
      }
    }
    this._debrisParticles.geometry.attributes.position.needsUpdate = true;
    this._debrisParticles.material.opacity = Math.max(0, 1 - data.progress * 0.8);

    if (data.progress > 1.5) {
      this._debrisParticles.userData.active = false;
      this._debrisParticles.material.opacity = 0;
    }
  }

  // ==================== 后处理（v13: 引力透镜增强） ====================
  updatePostEffects(uniforms, camera) {
    const cfg = config.blackhole;
    if (!camera || !this.group) return;
    const dist = this.group.position.distanceTo(camera.position);
    // v13: 扩大透镜影响范围
    const lensingRange = (cfg.distorionRadius || 600) * 1.4;
    if (dist < lensingRange && this.dangerLevel > 0) {
      this._tempVec.copy(this.group.position).project(camera);
      const screenX = (this._tempVec.x + 1) * 0.5;
      const screenY = (this._tempVec.y + 1) * 0.5;
      if (screenX > -0.1 && screenX < 1.1 && screenY > -0.1 && screenY < 1.1) {
        uniforms.uLensCenter.value.set(screenX, screenY);
        // v13: 强度+50%，范围+40%
        uniforms.uLensStrength.value = (cfg.lensingStrength || 0.35) * 1.5 * this.dangerLevel;
        uniforms.uLensRadius.value = 0.18 + this.dangerLevel * 0.22;
      } else { uniforms.uLensStrength.value = 0; }
    } else { uniforms.uLensStrength.value = 0; }
  }

  // ==================== 行星吸收（v13: delta解耦） ====================
  updatePlanetAbsorption(cfg, dt, elapsed) {
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
          this._activateDebris(planet.position);
        }
        data.absorbProgress += dt * 0.5;
        const shrink = Math.max(0, 1 - data.absorbProgress);
        const stretch = 1 + data.absorbProgress * stretchFactor;
        planet.scale.set(data.originalScale * shrink, data.originalScale * shrink * stretch, data.originalScale * shrink);
        const dir = new THREE.Vector3().subVectors(bhPos, planet.position).normalize();
        planet.lookAt(bhPos);
        planet.traverse((child) => {
          if (child.material?.emissive) child.material.emissive.lerp(new THREE.Color(1.0, 0.4, 0.05), dt * 2);
        });
        if (this._absorbParticles && !this._absorbParticles.userData.active) {
          this._absorbParticles.userData.active = true;
          this._absorbParticles.userData.targetPos.copy(planet.position);
          this._absorbParticles.userData.progress = 0;
        }
        if (data.absorbProgress >= 1.0) {
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
    if (this._absorbParticles?.userData.active) this.updateAbsorbParticles(cfg, dt, elapsed);
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
      pos[i3] = origin.x - this.group.position.x;
      pos[i3 + 1] = origin.y - this.group.position.y;
      pos[i3 + 2] = origin.z - this.group.position.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 20 + Math.random() * 40;
      vel[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      vel[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      vel[i3 + 2] = Math.cos(phi) * speed;
    }
    this._debrisParticles.material.opacity = 1.0;
  }

  updateAbsorbParticles(cfg, dt, elapsed) {
    const data = this._absorbParticles.userData;
    data.progress += dt * 0.8;
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
