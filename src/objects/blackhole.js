/**
 * 黑洞系统 v28 — Bug修复 + 科幻视觉升级 + 性能优化
 *
 * v28 核心改进：
 * - [Bug修复] distFactor 未定义导致吸积盘不显示 → 基于 currentR 动态计算
 * - [Bug修复] ShaderMaterial.opacity 无效 → 全部改用 uGlobalOpacity uniform
 * - [视觉] 吸积盘：磁场线 + X射线高能环 + 增强多普勒色散
 * - [视觉] 光子环：色散衍射（RGB不同绕射指数）
 * - [视觉] 喷流：Fresnel核心能量光束（圆柱体"骨干"）
 * - [视觉] 事件视界：吸积盘赤道倒影（极淡扭曲环）
 * - [视觉] 坠落粒子：彗星状时空拖尾
 * - [性能] LOD分级更激进（远距离完全不可见）
 * - [性能] 物质流线降频到 20fps + 15000+ 距离禁用
 * - [性能] Shader 细节分级（远距离跳过噪声采样）
 * - [性能] 碎片/吸收粒子休眠时 visible=false（减少 GPU draw call）
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

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
    this._photonSphere = null;
    this._matterStreams = null;
    this._debrisParticles = null;
    this._debrisVelocities = null;
    this._debrisActive = false;
    this._debrisProgress = 0;
    this._matterStreamAccum = 0;  // v28: 物质流线降频累加器
    this._diskBrightnessPulse = 0;
    this._diskContainer = null;  // v14: 盘容器（光子环+盘+喷流统一倾斜）
    this._jetBeamMaterial = null; // v28: 喷流核心光束
    this._ehReflectionMat = null; // v28: 事件视界倒影
    this._absorbColor = new THREE.Color(1.0, 0.4, 0.05);
    this._hud = null;
    // v29-fix: 预分配世界坐标临时向量，避免热路径 GC（黑洞在 galaxyCenterGroup 下，局部≠世界）
    this._worldPosA = new THREE.Vector3();
    this._worldPosB = new THREE.Vector3();
    this._worldPosC = new THREE.Vector3();
    this._worldPosD = new THREE.Vector3();
  }

  init(scene, camera, planetSystem) {
    this.camera = camera;
    this.planetSystem = planetSystem;
    const cfg = config.blackhole;
    // v25: 位置由 setLayoutPosition() 设置，不再从 config.position 读取

    // 1. 事件视界：绝对纯黑球体（最深沉的黑色）
    const horizonGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius, 64, 64);
    const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.group.add(new THREE.Mesh(horizonGeo, horizonMat));

    // v29: raytrace 模式下只保留事件视界 + 盘容器（供 raytrace shader 取矩阵），跳过旧粒子
    const useLegacy = cfg.renderMode !== 'raytrace' && cfg.particleDiskEnabled !== false;

    // v14: 吸积盘容器（raytrace 需要其 worldMatrix 做坐标变换）
    this._diskContainer = new THREE.Group();
    this._diskContainer.rotation.x = Math.PI * 0.5 + 0.61; // 35°倾斜
    this._diskContainer.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(this._diskContainer);

    if (useLegacy) {
      // 传统粒子模式：创建所有旧效果
      const reflectionGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius * 1.01, 32, 32);
      const reflectionMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDiskColor: { value: new THREE.Color(1.0, 0.6, 0.2) },
          uGlobalOpacity: { value: 1.0 },
        },
        vertexShader: `
          varying vec3 vNormal; varying vec3 vPos;
          void main() { vNormal = normalize(normalMatrix * normal); vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          varying vec3 vNormal; varying vec3 vPos;
          uniform vec3 uDiskColor; uniform float uGlobalOpacity;
          void main() {
            float equator = 1.0 - abs(vNormal.y);
            float band = smoothstep(0.0, 0.3, equator) * smoothstep(0.6, 0.3, equator);
            float twist = sin(atan(vPos.z, vPos.x) * 3.0) * 0.1;
            float alpha = band * 0.03 * (1.0 + twist) * uGlobalOpacity;
            if (alpha < 0.005) discard;
            gl_FragColor = vec4(uDiskColor * band, alpha);
          }
        `,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
      });
      this._ehReflectionMat = reflectionMat;
      this.group.add(new THREE.Mesh(reflectionGeo, reflectionMat));

      this.createPhotonSphere(cfg);
      this.createAccretionDisk(cfg);
      this.createJets(cfg);
      this.createGlow(cfg);
      this.createInfallParticles(cfg);
      this.createMatterStreams(cfg);
      this.createAbsorbParticles(cfg);
      this.createDebrisParticles(cfg);
    }

    scene.add(this.group);
    console.log('[BlackHole] v29 ' + (cfg.renderMode === 'raytrace' ? 'Gargantua 光线追踪' : '传统粒子') + '模式初始化完成');
  }

  // ==================== v14: 光子球 → 极细亮环（挂载盘容器，与盘面共面） ====================
  createPhotonSphere(cfg) {
    const r = cfg.photonSphereRadius || cfg.eventHorizonRadius * 1.5;
    // v19: 光子球 — 透明度-60% + 粗细减半，仅极淡光学边界
    const torusGeo = new THREE.TorusGeometry(r, cfg.eventHorizonRadius * 0.04, 12, 96);
    const torusMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1.0, 0.85, 0.6) },
        uGlobalOpacity: { value: 1.0 },  // v28
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
        uniform float uGlobalOpacity;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));

          // v28: 色散衍射 — 不同波长光绕射圈数不同，红光绕射更多，蓝光更少
          float rimR = pow(rim, 8.0);
          float rimG = pow(rim, 10.0);
          float rimB = pow(rim, 12.0);
          vec3 dispersedColor = vec3(rimR, rimG, rimB) * vec3(1.0, 0.9, 0.75);

          float pulse = 0.8 + sin(uTime * 4.0) * 0.2;
          float a = (rimR + rimG + rimB) / 3.0 * 0.05 * pulse * uGlobalOpacity;
          if (a < 0.02) discard;
          gl_FragColor = vec4(dispersedColor * pulse, a);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false,
    });
    this._photonSphere = new THREE.Mesh(torusGeo, torusMat);
    // v14: 环从默认XY面旋转到XZ面（与盘面共面），由盘容器统一倾斜
    this._photonSphere.rotation.x = Math.PI * 0.5;
    this._diskContainer.add(this._photonSphere);
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

      // v18: 温度梯度：扩大蓝白内圈 + 5区明显冷暖差
      const t = rNorm;
      let cr, cg, cb;
      if (t < 0.18) {
        // v18: 蓝白核心区扩大 12%→18%（>10000K）
        cr = 0.82 + Math.random() * 0.18; cg = 0.85 + Math.random() * 0.15; cb = 0.92 + Math.random() * 0.08;
      } else if (t < 0.35) {
        // 暖白（~8000K）
        cr = 0.88 + Math.random() * 0.12; cg = 0.78 + Math.random() * 0.2; cb = 0.55 + Math.random() * 0.3;
      } else if (t < 0.55) {
        // v18: 金黄（~4500K）
        cr = 0.95 + Math.random() * 0.05; cg = 0.45 + Math.random() * 0.3; cb = 0.05 + Math.random() * 0.1;
      } else if (t < 0.75) {
        // v18: 暗橙（~2500K，压暗）
        cr = 0.50 + Math.random() * 0.15; cg = 0.12 + Math.random() * 0.1; cb = 0.01 + Math.random() * 0.02;
      } else {
        // v18: 深暗红（~1200K，大幅压暗）
        cr = 0.20 + Math.random() * 0.12; cg = 0.02 + Math.random() * 0.03; cb = 0.0 + Math.random() * 0.02;
      }
      colors[i3] = cr; colors[i3 + 1] = cg; colors[i3 + 2] = cb;
      randoms[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    geometry.userData = { totalCount: particleCount }; // v15: LOD

    this.diskMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uInfallSpeed: { value: cfg.accretionInfallSpeed || 3.0 },
        uBrightnessPulse: { value: 0 },
        uInnerRadius: { value: innerR },
        uOuterRadius: { value: outerR },
        uEventHorizonR: { value: cfg.eventHorizonRadius },
        uGlobalOpacity: { value: 1.0 },  // v28: 替代 ShaderMaterial.opacity（无效）
        uDetailLevel: { value: 1.0 },   // v28: Shader 细节分级
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
        uniform float uGlobalOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDistNorm;
        varying vec3 vWPos;
        varying float vDoppler;

        void main() {
          vColor = color;
          vec3 pos = position;

          // Kepler差速旋转
          float rNorm = (aRadius - uInnerRadius) / max(uOuterRadius - uInnerRadius, 1.0);
          float orbitalSpeed = 0.15 / pow(rNorm + 0.06, 1.5);
          float rotAngle = uTime * orbitalSpeed;
          float ca = cos(rotAngle), sa = sin(rotAngle);
          float rx = pos.x * ca - pos.z * sa;
          float rz = pos.x * sa + pos.z * ca;
          pos.x = rx; pos.z = rz;

          // v15: 轨道切线方向（用于多普勒计算）
          vec3 orbitTangent = normalize(vec3(-pos.z, 0.0, pos.x));

          // v22: 增强随机性 + 全向内落
          float infallSpeedVar = 0.5 + aRandom * 1.5;  // 4:1速度差异
          float baseInfallT = mod(uTime * uInfallSpeed * 0.08 * infallSpeedVar + aRandom * 4.0, 1.0);

          // 三层噪声叠加 — 全向混沌
          float noisePhase = sin(aRandom * 12.3 + uTime * 0.2) * 0.45;
          float noisePhase2 = cos(aRandom * 7.9 + uTime * 0.35) * 0.35;
          float noisePhase3 = sin(aRandom * 18.7 + uTime * 0.55) * 0.25;

          // 视角偏置（降低权重，全向更自然）
          vec3 dirBias = normalize(cameraPosition - (modelMatrix * vec4(pos, 1.0)).xyz);
          float viewDirDot = dot(orbitTangent, dirBias);
          float directionBias = 0.25 * viewDirDot;

          float currentT = clamp(baseInfallT + noisePhase + noisePhase2 * 0.5 + noisePhase3 * 0.3 + directionBias, 0.0, 1.0);
          float accelFactor = 1.0 + 3.0 * pow(1.0 - currentT, 2.0);
          float currentR = uOuterRadius - (uOuterRadius - uInnerRadius) * min(currentT * accelFactor, 1.0);
          currentR = max(currentR, uInnerRadius * 1.02);
          // 角度扰动
          float angle2 = atan(pos.z, pos.x) + (noisePhase + noisePhase2 + noisePhase3) * 3.0;
          pos.x = cos(angle2) * currentR;
          pos.z = sin(angle2) * currentR;

          // v17: Y轴垂直湍流（弱化纯平面线条感）
          float yTurb = sin(uTime * 2.5 + aRandom * 10.0) * 0.7 * (1.0 - rNorm)
                      + cos(uTime * 1.8 + aRandom * 7.3) * 0.4 * rNorm;
          pos.y += yTurb;

          // v18: 引力弯折（幅度+30%）
          vec4 bhWorld = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 dirToCamera = normalize(cameraPosition - bhWorld.xyz);
          vec4 particleWorld = modelMatrix * vec4(pos, 1.0);
          vec3 dirToParticle = normalize(particleWorld.xyz - bhWorld.xyz);
          float alignment = dot(dirToParticle, dirToCamera);
          float farSide = 1.0 - smoothstep(-0.35, 0.35, alignment);
          float warpAmount = exp(-rNorm * 2.5) * uEventHorizonR * 3.6; // v19: +50%
          pos.y += farSide * warpAmount;

          // v15: 多普勒计算
          vec3 toCamera = normalize(cameraPosition - particleWorld.xyz);
          vDoppler = dot(orbitTangent, toCamera);

          // v28-fix: 基于当前实际半径计算归一化距离（修复 distFactor 未定义 Bug）
          float distFactor = clamp((currentR - uInnerRadius) / max(uOuterRadius - uInnerRadius, 0.001), 0.0, 1.0);

          // v26.3-fix: 回调亮度，避免黑洞过暗在中等距离几乎不可见
          float brightness = exp(-distFactor * 4.8) * 0.18;  // v20: 0.12→0.18
          brightness += exp(-distFactor * 13.0) * 0.12;       // v20: 0.08→0.12
          brightness += uBrightnessPulse * exp(-distFactor * 5.5) * 0.20; // v20: 0.15→0.20

          // v19: 内缘裁剪 — <1.1×事件视界直接透明，保证黑核纯黑
          float distFromEH = currentR / uEventHorizonR;
          float ehClip = smoothstep(1.0, 1.15, distFromEH);

          // 内缘消失 + 外缘淡入
          float fadeNearInner = 1.0 - smoothstep(0.88, 1.0, baseInfallT);
          float fadeFromOuter = smoothstep(0.0, 0.06, baseInfallT);
          float fadeAlpha = fadeNearInner * max(fadeFromOuter, 0.15);

          vAlpha = clamp(brightness * (0.6 + 0.4 * (1.0 - distFactor)) * fadeAlpha * ehClip * uGlobalOpacity, 0.0, 1.0);
          vColor *= brightness * ehClip;

          vec4 wp = modelMatrix * vec4(pos, 1.0); vWPos = wp.xyz;

          // v-fix: 粒子大小基于世界距离（而非视图深度 -mvPosition.z），
          // 避免镜头转动时粒子在屏幕边缘/中心深度变化导致大小波动 → "光弥散"
          float distToCam = length(cameraPosition - vWPos);
          float size = 1.2 + (1.0 - distFactor) * 0.6;
          gl_PointSize = size * uPixelRatio * (220.0 / max(distToCam, 1.0));
          gl_PointSize = clamp(gl_PointSize, 0.8, 12.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDistNorm;
        varying vec3 vWPos;
        varying float vDoppler;
        uniform float uTime;
        uniform float uOuterRadius;
        uniform float uDetailLevel;

        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise2D(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x),
                     mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y);
        }

        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha = pow(alpha, 0.6);

          // v28: Shader 细节分级（Fill-rate 优化）
          float angle2 = atan(vWPos.z, vWPos.x);
          float r2 = length(vWPos.xz) / max(uOuterRadius, 1.0);
          float brightnessMod;
          if (uDetailLevel > 0.5) {
            float n = noise2D(vec2(cos(angle2)*3.5, r2*6.0 + uTime*0.15));
            float spiralBand = noise2D(vec2(angle2 * 2.8 + r2 * 5.0, uTime * 0.08)) * 0.6;
            float bandNoise = noise2D(vec2(cos(angle2)*1.2, r2*2.5 + uTime*0.05));
            brightnessMod = 0.42 + n * 0.55 + spiralBand * 0.32 + bandNoise * 0.18;
          } else {
            // 远距离：只用简单 sin 模拟大尺度结构，跳过昂贵噪声采样
            brightnessMod = 0.5 + sin(angle2 * 3.0 + r2 * 5.0) * 0.15;
          }

          // v21: 多普勒 3.5× — 更戏剧化月牙
          float dopplerBright = 1.0 + vDoppler * 3.5;

          alpha *= vAlpha * brightnessMod * dopplerBright;
          if (alpha < 0.008) discard;

          // v28: 多普勒色偏增强 — 月牙不对称蓝白/暗红
          vec3 finalColor = vColor * brightnessMod * dopplerBright;
          finalColor += vec3(-0.12, -0.04, 0.18) * vDoppler * 1.5;

          // v28: 磁场线效果 — 螺旋状能量条纹（MRI磁转动不稳定性）
          if (uDetailLevel > 0.5) {
            float magneticLines = sin(angle2 * 8.0 + r2 * 20.0 + uTime * 0.8) * 0.5 + 0.5;
            magneticLines = pow(magneticLines, 5.0);
            float magneticIntensity = magneticLines * 0.3 * (1.0 - r2 * 0.6);
            finalColor += vec3(0.2, 0.05, 0.4) * magneticIntensity;

            // X射线高能环 — 内缘极紫外辐射（科幻蓝白色）
            float xrayRing = smoothstep(0.12, 0.0, r2) * 0.5;
            vec3 xrayColor = vec3(0.5, 0.8, 1.0) * xrayRing;
            finalColor += xrayColor;
          }

          // v28: 增强多普勒色散 — 一侧电离蓝，一侧暗红
          vec3 dopplerShift = vec3(1.0, 0.95, 0.9);
          if (vDoppler > 0.2) dopplerShift = vec3(0.6, 0.8, 1.1);
          else if (vDoppler < -0.2) dopplerShift = vec3(1.1, 0.5, 0.3);
          finalColor *= dopplerShift;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });

    this.accretionDisk = new THREE.Points(geometry, this.diskMaterial);
    // v14: 挂载到盘容器（容器统一倾斜，盘无需独立旋转）
    this._diskContainer.add(this.accretionDisk);
  }

  // ==================== v14: 喷流（挂载盘容器⊥盘面 + 准直+节点亮斑+高速流动） ====================
  createJets(cfg) {
    const jetCount = 600;
    const totalCount = jetCount * 2;
    const positions = new Float32Array(totalCount * 3);
    const colors = new Float32Array(totalCount * 3);
    const phases = new Float32Array(totalCount);
    const jetLen = cfg.jetLength * 1.5;

    for (let jet = 0; jet < 2; jet++) {
      const dir = jet === 0 ? 1 : -1;
      for (let i = 0; i < jetCount; i++) {
        const idx = jet * jetCount + i;
        const i3 = idx * 3;
        const t = Math.random();
        // v14: 高准直度 — 底部极细，远处缓慢扩散（平方根增长）
        const baseRadius = cfg.eventHorizonRadius * 0.06;
        const r = baseRadius + t * t * cfg.eventHorizonRadius * 0.15;
        const angle = Math.random() * Math.PI * 2;
        const y = cfg.eventHorizonRadius * 1.1 + t * jetLen;
        positions[i3] = Math.cos(angle) * r;
        positions[i3 + 1] = dir * y;
        positions[i3 + 2] = Math.sin(angle) * r;
        // v13 暖色：底亮白→中金黄→顶暗橙
        if (t < 0.15) {
          colors[i3] = 0.95; colors[i3 + 1] = 0.88; colors[i3 + 2] = 0.60;
        } else if (t < 0.5) {
          colors[i3] = 0.9; colors[i3 + 1] = 0.55; colors[i3 + 2] = 0.12;
        } else {
          colors[i3] = 0.5; colors[i3 + 1] = 0.18; colors[i3 + 2] = 0.03;
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
        uGlobalOpacity: { value: 1.0 },  // v28
      },
      vertexShader: `
        attribute float aPhase;
        uniform float uTime;
        uniform float uJetLength;
        uniform float uEHRadius;
        uniform float uPixelRatio;
        uniform float uGlobalOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vPhase;
        varying vec3 vWorldPos;
        varying vec3 vJetDir;
        void main() {
          vColor = color;
          vec3 pos = position;
          vPhase = aPhase;
          // v18: 喷流方向（在局部空间为±Y，需转世界空间）
          vec3 localJetDir = vec3(0.0, sign(pos.y), 0.0);
          vJetDir = normalize(mat3(modelMatrix) * localJetDir);

          // 流速×2.5
          float flow = mod(uTime * 2.0 + aPhase * 2.0, 2.0);
          float flowY = flow * uJetLength * 0.5;
          pos.y += sign(pos.y) * flowY;
          float absY = abs(pos.y);
          if (absY > uEHRadius * 1.1 + uJetLength) {
            pos.y = sign(pos.y) * uEHRadius * 1.1;
          }
          float t = clamp((absY - uEHRadius * 1.1) / uJetLength, 0.0, 1.0);

          // v18: 径向湍流 — 随距离增大横向扰动，打破笔直线条
          float radialTurb = sin(aPhase * 15.0 + uTime * 1.5) * t * t * uEHRadius * 0.25;
          pos.x += radialTurb * cos(aPhase * 6.28);
          pos.z += radialTurb * sin(aPhase * 6.28);

          // v18: 强化轴向衰减 — 指数衰减替代线性，末端自然消散
          float axialFade = exp(-t * 3.5);
          // 周期节点亮斑（减弱）
          float nodePulse = 1.0 + sin(t * 18.0 + uTime * 2.0) * 0.2;
          // v26.3: 喷流进一步压暗
          vAlpha = axialFade * 0.12 * nodePulse * uGlobalOpacity;

          vec4 wp = modelMatrix * vec4(pos, 1.0); vWorldPos = wp.xyz;
          // v-fix: 基于世界距离，避免镜头转动时粒子大小波动 → "光弥散"
          float distToCam = length(cameraPosition - vWorldPos);
          gl_PointSize = (0.6 + (1.0 - t) * 1.0) * axialFade * uPixelRatio * (280.0 / max(distToCam, 1.0));
          gl_PointSize = clamp(gl_PointSize, 0.5, 14.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vPhase;
        varying vec3 vWorldPos;
        varying vec3 vJetDir;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha = pow(alpha, 0.5);

          // v18: 视角衰减 — 正对喷流时几乎不可见，避免贯穿亮线
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float viewDot = abs(dot(viewDir, vJetDir));
          float viewFade = 0.15 + viewDot * 0.85; // 正对时仅15%可见

          alpha *= vAlpha * viewFade;
          if (alpha < 0.006) discard;
          gl_FragColor = vec4(vColor * 0.9, alpha);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });
    this.jetParticles = new THREE.Points(geo, this._jetMaterial);
    // v14: 挂载到盘容器，自动⊥盘面
    this._diskContainer.add(this.jetParticles);

    // v28: 核心能量光束 — Fresnel圆柱体作为喷流"骨干"
    const beamGeo = new THREE.CylinderGeometry(
      cfg.eventHorizonRadius * 0.03,  // 顶部半径（基部）
      cfg.eventHorizonRadius * 0.01,  // 底部半径（远端）
      jetLen * 2.2,
      12, 1, true
    );
    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.4, 0.7, 1.0) },
        uGlobalOpacity: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        uniform vec3 uColor;
        uniform float uGlobalOpacity;
        void main() {
          vec3 viewDir = normalize(vViewPos);
          float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 2.0);
          float alpha = fresnel * 0.12 * uGlobalOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor * (0.5 + fresnel * 0.5), alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._jetBeamMaterial = beamMat;
    const beam = new THREE.Mesh(beamGeo, beamMat);
    this._diskContainer.add(beam);
  }

  // ==================== v26.3: 外层光晕 — 大幅压暗，黑洞应为「暗」天体 ====================
  createGlow(cfg) {
    const glowGeo = new THREE.SphereGeometry(cfg.eventHorizonRadius * 1.8, 32, 32);
    this.glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.3, 0.12, 0.05) },
        uGlobalOpacity: { value: 1.0 },  // v28
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vLocalPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vLocalPos = position;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vLocalPos;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uGlobalOpacity;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, abs(dot(vNormal, viewDir)));
          float r = length(vLocalPos.xz);
          float h = abs(vLocalPos.y);
          float diskShape = exp(-h * h / (r * r * 0.08 + 1.0));
          float intensity = pow(rim, 5.0) * diskShape;
          float alpha = intensity * 0.008 * uGlobalOpacity; // v26.3: 0.06→0.008 (大幅压暗)
          if (alpha < 0.001) discard;
          gl_FragColor = vec4(uColor * intensity * 0.3 * uGlobalOpacity, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    this.group.add(new THREE.Mesh(glowGeo, this.glowMaterial));
  }

  // ==================== v24: 环境螺旋坠落粒子（GPU驱动，零CPU遍历） ====================
  createInfallParticles(cfg) {
    const count = cfg.infallParticleCount || 2000;
    const range = cfg.infallRange || cfg.accretionOuterRadius * 2;
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = range * (0.3 + Math.random() * 0.7);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.4;
      positions[i3 + 2] = r * Math.cos(phi);

      alphas[i] = 0.5 + Math.random() * 0.5;
      sizes[i] = 1.0 + Math.random() * 2.0;
      randoms[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    // v24: GPU驱动 — 所有运动逻辑在顶点着色器完成，CPU仅设uTime
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEHRadius: { value: cfg.eventHorizonRadius },
        uRange: { value: range },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uGlobalOpacity: { value: 1.0 },  // v28
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        attribute float aRandom;
        uniform float uTime;
        uniform float uEHRadius;
        uniform float uRange;
        uniform float uPixelRatio;
        uniform float uGlobalOpacity;
        varying float vAlpha;
        varying float vDist;

        float hash(float n) { return fract(sin(n) * 43758.5453); }

        void main() {
          // v24: 循环生命周期 — 每粒子独立周期，到视界后重生
          float speedMult = 0.7 + aRandom * 0.6;
          float spawnR = length(position);
          float avgSpeed = 15.0 + 120.0 * sqrt(uEHRadius / max(spawnR, 1.0));
          float cycleDuration = (spawnR - uEHRadius * 1.3) / max(avgSpeed * speedMult, 1.0);
          cycleDuration = max(cycleDuration, 2.0);

          // 循环相位 0→1（到达视界后重置）
          float phase = mod(uTime / cycleDuration + aRandom * 97.0, 1.0);

          // 当前半径：从spawn位置螺旋下降到事件视界边缘
          float currentR = mix(spawnR, uEHRadius * 1.25, phase * phase); // 平方加速内落

          // 螺旋角度：越靠近中心转越快（Kepler-like）
          float spinSpeed = 2.0 + 6.0 * pow(1.0 - phase, 1.5);
          float baseAngle = atan(position.z, position.x);
          float angle = baseAngle + phase * spinSpeed * (1.0 + aRandom * 2.0);

          // 随机倾角偏移
          float inclOff = (aRandom - 0.5) * 0.6;
          float inclAngle = (aRandom - 0.5) * 0.7;

          vec3 pos;
          pos.x = cos(angle) * currentR;
          pos.z = sin(angle) * currentR;
          pos.y = position.y * (1.0 - phase * 0.6) + sin(phase * 3.14) * inclOff * currentR * 0.15;

          // 湍流扰动（随距离增大）
          float turb = sin(uTime * 0.5 + aRandom * 10.0) * currentR * 0.015;
          pos.x += turb * cos(aRandom * 6.28);
          pos.z += turb * sin(aRandom * 6.28);
          pos.y += sin(uTime * 0.35 + aRandom * 7.0) * currentR * 0.008;

          vDist = currentR;
          float distNorm = clamp(currentR / (uEHRadius * 10.0), 0.0, 1.0);
          // 近视界更亮更小，重生时淡入
          float fade = smoothstep(0.0, 0.05, phase); // 重生淡入
          vAlpha = aAlpha * (0.02 + (1.0 - distNorm) * 0.15) * fade * uGlobalOpacity; // v28: +uGlobalOpacity
          float sizeScale = 0.25 + distNorm * 0.75;

          // v-fix: 基于世界距离，避免镜头转动时粒子大小波动 → "光弥散"
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          float distToCam = length(cameraPosition - wp.xyz);
          gl_PointSize = aSize * sizeScale * uPixelRatio * (600.0 / max(distToCam, 1.0));
          gl_PointSize = clamp(gl_PointSize, 0.8, 15.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
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

          // v28: 彗星状时空拖尾 — 模拟高速螺旋坠落方向
          float tail = smoothstep(0.0, 1.0, gl_PointCoord.x);
          alpha *= (0.4 + 0.6 * (1.0 - tail * 0.8));

          alpha *= vAlpha;
          if (alpha < 0.008) discard;
          float t = clamp(vDist / 300.0, 0.0, 1.0);
          vec3 nearColor = vec3(1.0, 1.0, 0.9);
          vec3 midColor  = vec3(1.0, 0.65, 0.15);
          vec3 farColor  = vec3(0.5, 0.08, 0.02);
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
    this.group.add(this._infallParticles);
  }

  // ==================== v17: 物质流线（大幅弱化：粒子减半+透明度-70%，消除臂感） ====================
  createMatterStreams(cfg) {
    const streamCount = cfg.matterStreamCount || 6;
    const particlesPerStream = Math.floor((cfg.matterStreamParticles || 80) * 0.4); // v17: 60%减少
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
        colors[i3] = 0.3; colors[i3 + 1] = 0.15; colors[i3 + 2] = 0.04;
        alphas[idx] = 0.03 + t * 0.15; // v17: 透明度-70%
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.PointsMaterial({
      size: 1.0, vertexColors: true, transparent: true, opacity: 0.15, // v17: 0.5→0.15
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
    if (this._jetBeamMaterial?.uniforms) this._jetBeamMaterial.uniforms.uTime.value = elapsed;

    // 光子球
    if (this._photonSphere?.material?.uniforms) this._photonSphere.material.uniforms.uTime.value = elapsed;

    // v15: 光晕
    if (this.glowMaterial) this.glowMaterial.uniforms.uTime.value = elapsed;

    // v28: 事件视界倒影
    if (this._ehReflectionMat?.uniforms) this._ehReflectionMat.uniforms.uTime.value = elapsed;

    // v15: 黑洞自转 × delta（帧率解耦）
    this.group.rotation.y += (cfg.selfRotationSpeed || 1.5) * dt * motionScale;

    // v16: 喷流进动 — 缓慢正弦摆动 + 随机微扰
    if (this._diskContainer) {
      const wobble = Math.sin(elapsed * 0.15) * 0.004 + Math.sin(elapsed * 0.37) * 0.0015;
      this._diskContainer.rotation.z += wobble * dt * motionScale;
    }

    // v29-fix: 黑洞 LOD — 用世界坐标计算距离（BH 在 galaxyCenterGroup 下有父级偏移）
    if (this.camera) {
      this.group.getWorldPosition(this._worldPosA);
      const dist = this._worldPosA.distanceTo(this.camera.position);
      const lodOpacity = 1.0;

      // 吸积盘粒子数（保守削减，保证至少绘制一个粒子）
      if (this.accretionDisk) {
        const totalCount = this.accretionDisk.geometry.userData?.totalCount || 10000;
        let targetFraction;
        if (dist < 2000) targetFraction = 1.0;
        else if (dist < 5000) targetFraction = 0.3;
        else if (dist < 10000) targetFraction = 0.08;
        else if (dist < 30000) targetFraction = 0.02;
        else targetFraction = 0.005; // v28-fix: 保留极少粒子
        const target = Math.max(Math.floor(totalCount * targetFraction), 1); // v28-fix: 最少1个
        if (this.accretionDisk.geometry.drawRange.count !== target) {
          this.accretionDisk.geometry.setDrawRange(0, target);
        }
      }

      // v28: Shader 细节分级（Fill-rate 优化）
      const detailLevel = dist < 5000 ? 1.0 : (dist < 15000 ? 0.5 : 0.0);
      if (this.diskMaterial?.uniforms?.uDetailLevel) {
        this.diskMaterial.uniforms.uDetailLevel.value = detailLevel;
      }

      // v28: 所有 ShaderMaterial 使用 uGlobalOpacity（替代无效的 .opacity）
      if (this.diskMaterial?.uniforms?.uGlobalOpacity) {
        this.diskMaterial.uniforms.uGlobalOpacity.value = lodOpacity;
      }
      if (this.glowMaterial?.uniforms?.uGlobalOpacity) {
        this.glowMaterial.uniforms.uGlobalOpacity.value = lodOpacity;
      }
      if (this._jetMaterial?.uniforms?.uGlobalOpacity) {
        this._jetMaterial.uniforms.uGlobalOpacity.value = lodOpacity;
      }
      if (this._jetBeamMaterial?.uniforms?.uGlobalOpacity) {
        this._jetBeamMaterial.uniforms.uGlobalOpacity.value = lodOpacity;
      }
      if (this._infallParticles?.material?.uniforms?.uGlobalOpacity) {
        this._infallParticles.material.uniforms.uGlobalOpacity.value = lodOpacity;
      }
      if (this._photonSphere?.material?.uniforms?.uGlobalOpacity) {
        this._photonSphere.material.uniforms.uGlobalOpacity.value = lodOpacity;
      }
      if (this._ehReflectionMat?.uniforms?.uGlobalOpacity) {
        this._ehReflectionMat.uniforms.uGlobalOpacity.value = lodOpacity;
      }
      // v28: _matterStreams 使用 PointsMaterial，.opacity 有效
      if (this._matterStreams?.material) {
        this._matterStreams.material.opacity = lodOpacity * 0.15;
      }
    }

    // v24: 坠落粒子 — GPU驱动，仅更新uTime（零CPU遍历）
    if (this._infallParticles?.material?.uniforms) {
      this._infallParticles.material.uniforms.uTime.value = elapsed;
    }

    // 物质流线
    this.updateMatterStreams(cfg, dt, elapsed, motionScale);

    // 碎片
    this.updateDebris(cfg, dt);

    // v29-fix: 引力 + 重生 + 信息 — 用世界坐标（BH 在 galaxyCenterGroup 下有父级偏移）
    if (this.camera) {
      this.group.getWorldPosition(this._worldPosB);
      const dist = this._worldPosB.distanceTo(this.camera.position);
      if (dist < cfg.dangerRadius) {
        this.dangerLevel = Math.max(0, Math.min(1, 1.0 - (dist - cfg.pullRadius) / (cfg.dangerRadius - cfg.pullRadius)));
        if (cfg.gravityEnabled !== false && dist < cfg.pullRadius && dist > cfg.eventHorizonRadius * 2) {
          const pullForce = (1 - dist / cfg.pullRadius) * cfg.pullStrength * dt;
          if (this._tempVec.subVectors(this._worldPosB, this.camera.position).lengthSq() > 1e-8) {
            this._tempVec.normalize();
            this.camera.position.addScaledVector(this._tempVec, pullForce);
          }
        }
      } else {
        this.dangerLevel = 0;
      }
      if (dist < (cfg.infoDistance || 800)) {
        this._showInfo(cfg, dist);
      } else if (this._infoShown) {
        if (this._hud) this._hud.hideCelestialInfo();
        this._infoShown = false;
      }
    }

    // 行星吸收
    this.updatePlanetAbsorption(cfg, dt, elapsed);
  }

  // ==================== 物质流线更新（v28: 降频到20fps + 远距离禁用） ====================
  updateMatterStreams(cfg, dt, elapsed, motionScale) {
    if (!this._matterStreams) return;

    // v29-fix: 远距离完全禁用物质流线更新 — 用世界坐标
    if (this.camera) {
      this.group.getWorldPosition(this._worldPosC);
      const dist = this._worldPosC.distanceTo(this.camera.position);
      if (dist > 15000) {
        if (this._matterStreams.visible) this._matterStreams.visible = false;
        return;
      }
      if (!this._matterStreams.visible) this._matterStreams.visible = true;
    }

    // v28: 降频到 20fps
    this._matterStreamAccum = (this._matterStreamAccum || 0) + dt;
    if (this._matterStreamAccum < 0.05) return;
    this._matterStreamAccum = 0;

    const data = this._matterStreams.userData;
    data.animOffset += 0.05 * 0.5 * motionScale;

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

  // ==================== 碎片更新（v28: 休眠时隐藏GPU提交） ====================
  updateDebris(cfg, dt) {
    if (!this._debrisParticles || !this._debrisParticles.userData.active) {
      if (this._debrisParticles) this._debrisParticles.visible = false;
      return;
    }
    this._debrisParticles.visible = true;
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
      this._debrisParticles.visible = false;
    }
  }

  // ==================== 后处理（v14: 引力透镜平方反比衰减 + 平滑插值） ====================
  updatePostEffects(uniforms, camera) {
    const cfg = config.blackhole;
    if (!camera || !this.group || !uniforms) return;
    // v25: 防御性检查 — 确保所需 uniform 存在
    if (!uniforms.uLensStrength || !uniforms.uLensCenter || !uniforms.uLensRadius) return;
    this.group.getWorldPosition(this._worldPosD);  // v29-fix: 世界坐标
    const dist = this._worldPosD.distanceTo(camera.position);
    const lensingRange = (cfg.distorionRadius || 600) * 1.4;

    // 先算目标值（不直接写 uniforms）
    let targetX = 0.5, targetY = 0.5, targetStrength = 0, targetRadius = 0.16;
    if (dist < lensingRange && this.dangerLevel > 0) {
      this._tempVec.copy(this._worldPosD).project(camera);
      const screenX = (this._tempVec.x + 1) * 0.5;
      const screenY = (this._tempVec.y + 1) * 0.5;
      if (screenX > -0.1 && screenX < 1.1 && screenY > -0.1 && screenY < 1.1) {
        targetX = screenX;
        targetY = screenY;
        const maxStrength = (cfg.lensingStrength || 0.35) * 1.5 * this.dangerLevel;
        const screenDist = Math.sqrt(
          (screenX - 0.5) * (screenX - 0.5) + (screenY - 0.5) * (screenY - 0.5)
        );
        targetStrength = maxStrength / (1.0 + screenDist * screenDist * 80.0);
        targetRadius = 0.16 + this.dangerLevel * 0.18;
      }
    }

    // v-fix: 平滑插值 — 避免镜头转动时扭曲中心/强度逐帧跳变造成"红光弥散"
    if (this._lensSX === undefined) {
      this._lensSX = 0.5; this._lensSY = 0.5; this._lensSS = 0; this._lensSR = 0.16;
    }
    const sm = 0.18; // 每帧朝目标移动 18%，约 5 帧到位（~80ms）
    this._lensSX += (targetX - this._lensSX) * sm;
    this._lensSY += (targetY - this._lensSY) * sm;
    this._lensSS += (targetStrength - this._lensSS) * sm;
    this._lensSR += (targetRadius - this._lensSR) * sm;

    uniforms.uLensCenter.value.set(this._lensSX, this._lensSY);
    uniforms.uLensStrength.value = this._lensSS;
    uniforms.uLensRadius.value = this._lensSR;
  }

  // ==================== 行星吸收（v13: delta解耦） ====================
  updatePlanetAbsorption(cfg, dt, elapsed) {
    if (!this.planetSystem) return;
    const planets = this.planetSystem.getPlanets();
    // v29-fix: 用世界坐标（BH 在 galaxyCenterGroup 下有父级偏移，planet.position 是世界坐标）
    this.group.getWorldPosition(this._worldPosA);
    const bhPos = this._worldPosA;
    const stretchFactor = cfg.tidalStretchFactor || 3.0;

    for (let i = planets.length - 1; i >= 0; i--) {
      const planet = planets[i];
      // v29-fix: 用世界坐标（planet 在 solarSystem.group 下也有父级偏移）
      planet.getWorldPosition(this._worldPosB);
      const dist = bhPos.distanceTo(this._worldPosB);
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
        planet.lookAt(bhPos);
        planet.traverse((child) => {
          if (child.material?.emissive) child.material.emissive.lerp(this._absorbColor, dt * 2);
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


  /** v25: 设置布局位置（不再使用 respawn） */
  setLayoutPosition(pos) {
    this.group.position.copy(pos);
  }

  _showInfo(cfg, dist) {
    if (!this._hud) return;
    this._infoShown = true;
    this._hud.showCelestialInfo('黑洞', 'Stellar Black Hole', [
      `事件视界: ${cfg.eventHorizonRadius} AU`, `吸积盘: ${cfg.accretionInnerRadius}~${cfg.accretionOuterRadius} AU`,
      `引力范围: ${cfg.pullRadius} AU`, `距离: ${dist.toFixed(0)} AU`,
    ].join('<br>'));
  }

  setHUD(hud) { this._hud = hud; }
  getDangerLevel() { return this.dangerLevel; }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}
