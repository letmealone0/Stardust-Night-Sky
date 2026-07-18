/**
 * 脉冲星系统 v27.6
 * 快速旋转的中子星 + 双锥辐射束
 * v27.6: 磁偏角灯塔效应（磁轴绕X偏转→自转时扫过空间）、postEffects真实扫过检测、
 *        几何体复用、常量命名TAU
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class Pulsar {
  constructor() {
    this.group = new THREE.Group();
    this._magneticGroup = new THREE.Group(); // v27.5: 磁轴子组，绕X轴偏转实现灯塔效应
    this.group.add(this._magneticGroup);
    this.beams = [];
    this.rotationSpeed = 0;
    this.camera = null;
    this._hud = null;
    this._infoShown = false;
    this._flashDecay = 0;
    this._tmpCamDir = new THREE.Vector3();
    this._tmpBeamDir = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3(0, 1, 0);
  }

  setCamera(camera) { this.camera = camera; }
  setHUD(hud) { this._hud = hud; }

  init(scene) {
    const cfg = config.pulsar;
    this.rotationSpeed = cfg.rotationSpeed;

    // v27.5: 磁偏角 — 磁轴绕X轴偏转，与自转轴(Y)形成夹角，实现灯塔扫过效果
    const tiltRad = THREE.MathUtils.degToRad(cfg.magneticTilt || 25);
    this._magneticGroup.rotation.x = tiltRad;

    // ======== 磁轴子组（随磁轴偏转）========
    this._createStarBody(cfg);
    for (let i = 0; i < 2; i++) {
      this._createBeam(cfg, i === 0 ? 1 : -1);
    }
    this._createMagneticFieldLines(cfg, cfg.radius * 9);

    // ======== 赤道面子组（不随磁轴偏转，固定在自转赤道面）========
    this._createAccretionDisk(cfg);
    this._createDisturbanceShell(cfg);

    scene.add(this.group);
    this._infoShown = false;
    this._flashDecay = 0;
    console.log(`[Pulsar] v28 初始化完成（磁偏角 ${cfg.magneticTilt || 25}°，20条磁场线，灯塔效应已启用）`);
  }

  // ==================== 中子星本体（三层辉光结构） ====================
  _createStarBody(cfg) {
    const starColor = new THREE.Color(cfg.color.r, cfg.color.g, cfg.color.b);

    // 核心星体 — 极小范围极高亮度
    const starGeo = new THREE.SphereGeometry(cfg.radius, 48, 48);
    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: starColor },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vLocalNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vLocalNormal = normalize(normal); // 局部空间法线，用于磁极计算
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vLocalNormal;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 normal = normalize(vNormal);

          // v27.1: 核心亮度拉升
          float core = pow(max(0.0, dot(viewDir, normal)), 8.0) * 4.5;
          float mid = exp(-pow(1.0 - dot(viewDir, normal), 2.0) * 3.0) * 1.5;
          float outer = exp(-pow(1.0 - dot(viewDir, normal), 2.0) * 0.5) * 0.15;

          // v27.4: 磁极增亮 — 局部空间法线+固定Y轴，坐标系一致
          float poleDot = abs(dot(vLocalNormal, vec3(0.0, 1.0, 0.0)));
          float poleBoost = 1.0 + poleDot * 0.6;

          float pulse = 0.65 + sin(uTime * 10.0) * 0.35;
          float total = (core + mid + outer) * poleBoost * pulse;
          vec3 col = uColor * (core * 3.5 + mid * 0.6 + outer * 0.2) * poleBoost * pulse;
          float alpha = min(1.0, total);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.userData.material = starMat;
    this._magneticGroup.add(star);

    // v27.1: 外层大范围辉光球（半径16×）
    const outerGlowGeo = new THREE.SphereGeometry(cfg.radius * 16, 32, 32);
    const outerGlowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: starColor },
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
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, abs(dot(normalize(vNormal), viewDir)));
          float alpha = exp(-pow(1.0 - rim, 2.0) * 8.0) * 0.12; // v27.1: 0.06→0.12
          alpha = max(0.0, alpha);
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(uColor * 0.3, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const outerGlow = new THREE.Mesh(outerGlowGeo, outerGlowMat);
    outerGlow.userData.material = outerGlowMat;
    this._magneticGroup.add(outerGlow);
  }

  // ==================== 双锥辐射束（双层结构 + 高斯柔边 + 能量流动） ====================
  _createBeam(cfg, direction) {
    // v27: 核心光束 — 更细（radius*0.8）、高斯衰减、能量流动
    const beamRadius = cfg.radius * 0.8;
    const beamLen = cfg.beamLength;
    const beamGeo = new THREE.ConeGeometry(beamRadius, beamLen, 48, 1, true);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(cfg.color.r, cfg.color.g, cfg.color.b) },
        uDirection: { value: direction },
        uBeamHalfLen: { value: beamLen / 2 },
        uBeamRadius: { value: beamRadius },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vLocalPos;
        void main() {
          vPosition = position;
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vPosition;
        varying vec3 vLocalPos;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uDirection;
        uniform float uBeamHalfLen;
        uniform float uBeamRadius;

        void main() {
          // 轴向位置（0=根部，1=远端）
          float t = abs(vPosition.y) / uBeamHalfLen;

          // v27: 径向高斯柔边（替代线性衰减，消除硬边）
          float radialDist = length(vPosition.xz) / max(uBeamRadius, 0.01);
          float radial = exp(-pow(radialDist * 2.2, 2.0));

          // v27.1: 轴向平滑衰减（幂次1.8，延长可见距离）
          float beam = 1.0 - t;
          beam = max(0.0, beam);
          float axial = pow(beam, 1.8);

          // v27.4: 根部亮度加强（smoothstep替代分支，更平滑）
          float rootBoost = 1.0 + 0.4 * (1.0 - smoothstep(0.0, 0.2, t));
          axial *= rootBoost;

          // v27.1: 核心脉冲（最低值0.65保证基础亮度）
          float corePulse = 0.65 + sin(uTime * 10.0 * uDirection + t * 2.0) * 0.25;
          // v27: 外层脉冲（相位偏移，幅度小）
          float haloPulse = 0.6 + sin(uTime * 10.0 * uDirection - uTime * 2.0 + t * 2.5) * 0.2;

          // v27: 轴向能量流动动画
          float flow = sin(vPosition.y * 0.025 - uTime * 6.0) * 0.12 + 0.88;

          // v27: 细微湍流扰动（多层正弦叠加，打破人工感）
          float turb1 = sin(vPosition.x * 0.15 + uTime * 3.0) * cos(vPosition.z * 0.18 - uTime * 2.5) * 0.06;
          float turb2 = sin(vPosition.y * 0.12 + uTime * 4.5) * cos(vPosition.z * 0.22 + uTime * 3.0) * 0.04;
          float turbulence = 0.92 + turb1 + turb2;

          // ======== v27.1: 核心窄光束（亮度翻倍） ========
          float coreIntensity = axial * radial * corePulse * flow * turbulence;
          coreIntensity = clamp(coreIntensity, 0.0, 1.0);
          vec3 coreColor = uColor * coreIntensity * 3.2;  // 2.0→3.2

          // ======== v27.1: 外层弥散光晕（亮度+透明度翻倍） ========
          float haloRadial = exp(-pow(radialDist * 0.8, 2.0));
          float haloIntensity = axial * haloRadial * haloPulse * 0.2;
          haloIntensity = clamp(haloIntensity, 0.0, 1.0);
          vec3 haloColor = uColor * haloIntensity * 1.2;  // 0.6→1.2

          vec3 finalColor = coreColor + haloColor;
          float finalAlpha = coreIntensity * 0.7 + haloIntensity * 0.25; // 0.5→0.7, 0.15→0.25

          if (finalAlpha < 0.003) discard;
          gl_FragColor = vec4(finalColor, finalAlpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = direction * (cfg.radius + beamLen / 2);
    beam.userData.material = beamMat;
    beam.userData.direction = direction;
    this._magneticGroup.add(beam);
    this.beams.push(beam);
  }

  // ==================== v28: 磁场线（合并为单个 LineSegments，20 条线 → 1 draw call） ====================
  _createMagneticFieldLines(cfg, maxArcRadius) {
    const count = 20; // 20条磁力线
    const r = cfg.radius;
    const segments = 48;
    // 每条线 segments 段，每段 2 顶点（LineSegments/LINES 模式）
    const vertCount = count * segments * 2;
    const positions = new Float32Array(vertCount * 3);
    const phases = new Float32Array(vertCount);
    const brightnesses = new Float32Array(vertCount);

    for (let i = 0; i < count; i++) {
      const phi = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const curveOffset = 0.4 + Math.random() * 0.8;
      const brightness = 0.4 + Math.random() * 0.6; // 亮度差异模拟疏密
      const phase = i / count;
      const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

      let prevX = 0, prevY = 0, prevZ = 0;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const theta = Math.PI * t;
        const arcR = r * 1.3 + maxArcRadius * Math.sin(theta) * curveOffset;
        const x = cosPhi * arcR * Math.sin(theta);
        const y = Math.cos(theta) * arcR;
        const z = sinPhi * arcR * Math.sin(theta);
        if (j > 0) {
          // 写入一段：prev -> current（LineSegments 每段2顶点）
          const segBase = (i * segments + (j - 1)) * 2;
          const aIdx = segBase * 3;
          const bIdx = (segBase + 1) * 3;
          positions[aIdx] = prevX; positions[aIdx + 1] = prevY; positions[aIdx + 2] = prevZ;
          positions[bIdx] = x; positions[bIdx + 1] = y; positions[bIdx + 2] = z;
          phases[segBase] = phase; phases[segBase + 1] = phase;
          brightnesses[segBase] = brightness; brightnesses[segBase + 1] = brightness;
        }
        prevX = x; prevY = y; prevZ = z;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightnesses, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDiskThickness: { value: r * 0.6 },
      },
      vertexShader: `
        attribute float aPhase;
        attribute float aBrightness;
        varying float vTheta;
        varying vec3 vLocalPos;
        varying float vBrightness;
        varying float vPhase;
        void main() {
          vec3 normPos = normalize(position);
          vTheta = acos(clamp(normPos.y, -1.0, 1.0));
          vLocalPos = position;
          vBrightness = aBrightness;
          vPhase = aPhase;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vTheta;
        varying vec3 vLocalPos;
        varying float vBrightness;
        varying float vPhase;
        uniform float uTime;
        uniform float uDiskThickness;
        void main() {
          float poleFactor = abs(cos(vTheta));
          float brightness = 0.2 + poleFactor * 0.8;
          // 每线独立相位，脉冲错开（phase 通过 attribute 传入）
          float TAU = 6.283185307;
          float pulse = 0.65 + sin(uTime * 2.5 + vPhase * TAU) * 0.25;
          // 吸积盘平面裁剪
          float diskDist = abs(vLocalPos.y);
          float diskMask = smoothstep(0.0, uDiskThickness, diskDist);
          float alpha = 0.07 * brightness * pulse * diskMask * vBrightness;
          if (alpha < 0.005) discard;
          vec3 col = mix(vec3(0.4, 0.6, 1.0), vec3(0.6, 0.85, 1.0), brightness);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false,
    });

    this._fieldLinesGroup = new THREE.Group();
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 0; // 先于吸积盘渲染
    lines.userData.material = mat;
    this._fieldLinesGroup.add(lines);
    this._magneticGroup.add(this._fieldLinesGroup);
  }

  // ==================== v27.3: 薄吸积盘（RingGeometry连续盘 + 着色器 + 开普勒旋转） ====================
  _createAccretionDisk(cfg) {
    const innerR = cfg.radius * 1.5;
    const outerR = cfg.radius * 5;
    // 独立旋转组 — 内圈快外圈慢
    this._diskGroup = new THREE.Group();
    this.group.add(this._diskGroup);

    // 主体盘：RingGeometry + ShaderMaterial 平滑发光
    const diskGeo = new THREE.RingGeometry(innerR, outerR, 96, 1);
    const diskMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uInnerRadius: { value: innerR },
        uOuterRadius: { value: outerR },
        uOpacity: { value: 1.0 }, // v27.5: 透明度uniform（ShaderMaterial的opacity不自动生效）
      },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vLocalPos;
        uniform float uTime;
        uniform float uInnerRadius;
        uniform float uOuterRadius;
        uniform float uOpacity;
        void main() {
          float r = length(vLocalPos.xz);
          float t = clamp((r - uInnerRadius) / max(uOuterRadius - uInnerRadius, 1.0), 0.0, 1.0);
          // 内圈亮橙红→外圈暗红平滑渐变
          float brightness = exp(-t * 3.5) * 0.5 + exp(-t * 1.2) * 0.15;
          // 螺旋扰动
          float angle = atan(vLocalPos.z, vLocalPos.x);
          float spiral = sin(angle * 3.0 + uTime * 0.5 + r * 0.3) * 0.15 + 0.85;
          // 内密外疏
          float density = 1.0 - smoothstep(0.0, 1.0, t);
          float alpha = brightness * spiral * density * 0.25 * uOpacity; // v27.5: 乘 uOpacity
          if (alpha < 0.01) discard;
          vec3 innerColor = vec3(0.9, 0.35, 0.08);
          vec3 outerColor = vec3(0.35, 0.06, 0.02);
          vec3 col = mix(innerColor, outerColor, t);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      transparent: true, depthWrite: false,
    });
    // 3层叠加（主层+上下副层）模拟薄盘厚度，侧视不消失
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.rotation.x = -Math.PI / 2;
    disk.renderOrder = 1; // 晚于磁场线渲染
    disk.userData.material = diskMat;
    this._diskGroup.add(disk);
    // v27.5: 副层 — userData.material确保uTime更新，uOpacity控制半透明，复用diskGeo节省内存
    for (let i = -1; i <= 1; i += 2) {
      const subDisk = new THREE.Mesh(diskGeo, diskMat.clone()); // 复用几何体，仅克隆材质
      subDisk.rotation.x = -Math.PI / 2;
      subDisk.position.y = i * cfg.radius * 0.08;
      subDisk.material.uniforms.uOpacity.value = 0.08;
      subDisk.userData.material = subDisk.material;
      this._diskGroup.add(subDisk);
    }

    // 内缘高光灯环
    const ringGeo = new THREE.RingGeometry(innerR * 0.92, innerR * 1.05, 64, 1);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uInnerR: { value: innerR } },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vLocalPos;
        uniform float uTime;
        uniform float uInnerR;
        void main() {
          float r = length(vLocalPos.xz);
          float innerRef = uInnerR * 0.92;
          float outerRef = uInnerR * 1.05;
          float glow = 1.0 - abs((r - (innerRef + outerRef) * 0.5) / ((outerRef - innerRef) * 0.5));
          glow = pow(max(0.0, glow), 2.0);
          float pulse = 0.8 + sin(uTime * 6.0) * 0.2;
          float alpha = glow * 0.6 * pulse;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(1.0, 0.6, 0.15, alpha);
        }
      `,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      transparent: true, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.userData.material = ringMat;
    this._diskGroup.add(ring);
  }

  // ==================== v27.3: 电磁扰动层（通透Fresnel，仅边缘微光） ====================
  _createDisturbanceShell(cfg) {
    const shellGeo = new THREE.SphereGeometry(cfg.radius * 8, 48, 48);
    const shellMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vWorldPos; varying vec3 vLocalPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz; vLocalPos = position;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal; varying vec3 vWorldPos; varying vec3 vLocalPos;
        uniform float uTime;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
          float fresnel = pow(rim, 4.5);          // 3.5→4.5 收紧边缘
          float alpha = fresnel * 0.08;            // 0.18→0.08 大幅压透
          alpha = clamp(alpha, 0.0, 0.15);         // 边缘峰值≤0.15
          if (alpha < 0.005) discard;
          // 冷蓝白色调
          vec3 col = mix(vec3(0.35, 0.45, 0.85), vec3(0.45, 0.55, 0.9), fresnel);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      blending: THREE.AdditiveBlending, side: THREE.BackSide,
      transparent: true, depthWrite: false,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.userData.material = shellMat;
    this.group.add(shell);
  }

  // ==================== 更新 ====================
  update(delta, elapsed) {
    const cfg = config.pulsar;
    const cm = config.celestialMotion;
    const motionScale = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;

    // 自转
    this.group.rotation.y += this.rotationSpeed * delta * motionScale;

    // v27.3: 磁场线慢速旋转（转速约为星体的60%）
    if (this._fieldLinesGroup) {
      this._fieldLinesGroup.rotation.y += this.rotationSpeed * 0.6 * delta * motionScale;
    }

    // v27.3: 吸积盘开普勒差速旋转（内圈快外圈慢，在shader中实现）
    if (this._diskGroup) {
      this._diskGroup.rotation.y += this.rotationSpeed * 0.4 * delta * motionScale;
    }

    // 更新所有 shader 时间
    this.group.traverse((child) => {
      const mat = child.userData?.material;
      if (mat?.uniforms) mat.uniforms.uTime.value = elapsed;
    });

    // 靠近显示信息
    if (this.camera) {
      const dist = this.group.position.distanceTo(this.camera.position);
      const infoDist = cfg.infoDistance || 500;
      if (dist < infoDist) {
        this._showInfo(cfg, dist);
      } else if (this._infoShown) {
        if (this._hud) this._hud.hideCelestialInfo();
        this._infoShown = false;
      }
    }
  }

  // ==================== 后处理（闪光蓝白 + 扫描线噪点） ====================
  updatePostEffects(uniforms, camera, delta) {
    const cfg = config.pulsar;
    if (!camera || !this.group || !uniforms) return;
    // v28: 防御性检查 — 确保所需 uniform 存在再操作
    if (uniforms.uFlashIntensity === undefined && uniforms.uNoiseIntensity === undefined) return;

    const dist = this.group.position.distanceTo(camera.position);

    // v27.5: 射束扫过检测 — 使用倾斜后的磁轴方向计算真实扫过
    this._tmpCamDir.subVectors(camera.position, this.group.position).normalize();
    const rotY = this.group.rotation.y;
    const tiltRad = THREE.MathUtils.degToRad(cfg.magneticTilt || 25);
    // 磁轴方向：先绕X偏转，再随group绕Y自转 → 在空间中画圆锥
    this._tmpBeamDir.set(0, Math.cos(tiltRad), Math.sin(tiltRad)).applyAxisAngle(this._tmpUp, rotY);
    const dot1 = Math.abs(this._tmpCamDir.dot(this._tmpBeamDir));
    this._tmpBeamDir.set(0, -Math.cos(tiltRad), -Math.sin(tiltRad)).applyAxisAngle(this._tmpUp, rotY);
    const dot2 = Math.abs(this._tmpCamDir.dot(this._tmpBeamDir));
    const maxDot = Math.max(dot1, dot2);

    // v27: 闪光升级 — 蓝白色，配合轻微对比度提升
    const sweepThreshold = cfg.beamSweepAngle || 0.25;
    if (maxDot > sweepThreshold && dist < (cfg.beamLength || 300) * 3) {
      const flashStrength = ((maxDot - sweepThreshold) / (1 - sweepThreshold)) * (cfg.flashIntensity || 0.8);
      this._flashDecay = Math.max(this._flashDecay, flashStrength);
      // 轻微对比度提升
      if (uniforms.uContrast) {
        uniforms.uContrast.value = 1.0 + this._flashDecay * 0.08;
      }
    }

    // 闪光衰减
    if (this._flashDecay > 0.001) {
      this._flashDecay *= Math.exp(-(cfg.flashDecay || 4.0) * delta);
      if (this._flashDecay < 0.001) this._flashDecay = 0;
    }
    uniforms.uFlashIntensity.value = this._flashDecay;
    // 恢复对比度
    if (this._flashDecay < 0.001 && uniforms.uContrast) {
      uniforms.uContrast.value = config.renderer?.contrast ?? 1.0;
    }

    // v27: 噪点分层
    const noiseRange = cfg.noiseDistance || 400;
    if (dist < noiseRange && uniforms.uNoiseIntensity !== undefined) {
      const noiseStrength = (1 - dist / noiseRange) * (cfg.maxNoiseIntensity || 0.5);
      uniforms.uNoiseIntensity.value = noiseStrength;
      if (uniforms.uChromaticAberration !== undefined) {
        uniforms.uChromaticAberration.value = noiseStrength * 0.03;
      }
    } else if (uniforms.uNoiseIntensity !== undefined) {
      uniforms.uNoiseIntensity.value = 0;
    }
  }

  _showInfo(cfg, dist) {
    if (!this._hud) return;
    this._infoShown = true;
    const period = (2 * Math.PI / cfg.rotationSpeed).toFixed(2);
    const details = [
      `中子星半径: ${cfg.radius} AU`,
      `光束长度: ${cfg.beamLength} AU`,
      `自转周期: ${period}s`,
      `距离: ${dist.toFixed(0)} AU`,
    ].join('<br>');
    this._hud.showCelestialInfo('脉冲星', 'Neutron Star — Pulsar', details);
  }

  setLayoutPosition(pos) { this.group.position.copy(pos); }

  dispose(scene) {
    scene.remove(this.group);
    // 递归释放所有子节点（_magneticGroup 下的中子星/光束/磁场线、_diskGroup 下的盘/环、shell）
    // 原 forEach 只遍历直接子节点（均为 Group，无 geometry/material），导致大量资源泄漏
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.beams = [];
    // 清理子组引用，避免内存泄漏
    this._fieldLinesGroup = null;
    this._diskGroup = null;
  }
}
