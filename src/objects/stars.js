import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange } from '../utils/random.js';

// v7.1: 高斯随机分布（参考 GalaxyThreeJS），让粒子更自然聚集在旋臂中
function gaussianRandom(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

export class StarField {
  constructor() {
    this.meshes = [];
    this.materials = [];
    this.geometries = [];
    this.brightStars = [];
    this.galaxyMaterial = null; // 银河 Shader 材质（用于更新时间）
    this.hazePoints = null;     // v26: 雾气 Points 引用（自适应画质用）
  }

  init(scene, galaxyCenterGroup) {
    const { spread } = config.stars;

    // v25-fix5: 精简星空层次，
    // 由「银河系（核球+旋臂+尘埃+银晕）+ 高亮星」承担
    // v26: 太阳系周围排除区（10000单位内不生成亮星）
    const galPos = config.stars.galaxy?.position || { x: -15000, y: 500, z: -30000 };
    const solarR = config.galaxyMotion?.solarOrbitRadius || 22000;
    const solarCenter = new THREE.Vector3(galPos.x + solarR, galPos.y, galPos.z);
    this.createBrightStars(scene, spread, solarCenter, 10000);
    // v26: 银河粒子挂到 galaxyCenterGroup 下，与太阳系共面
    const targetGroup = galaxyCenterGroup || scene;
    this.createMilkyWay(scene, targetGroup, spread);

    // v30: 银河核球全息体积辉光
    this.createGalaxyCoreGlow(targetGroup);

    console.log('[StarField] 星空初始化完成（含核球辉光）');
  }



  createBrightStars(scene, spread, exclusionCenter, exclusionRadius) {
    const count = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const frequencies = new Float32Array(count);
    const exR2 = exclusionRadius ? exclusionRadius * exclusionRadius : 0;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let px, py, pz;
      let attempts = 0;
      do {
        px = randomRange(-spread, spread);
        py = randomRange(-spread, spread);
        pz = randomRange(-spread, spread);
        attempts++;
      } while (exclusionCenter && exR2 > 0 && attempts < 50 &&
        (px - exclusionCenter.x) ** 2 + (py - exclusionCenter.y) ** 2 + (pz - exclusionCenter.z) ** 2 < exR2);

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      const isBlue = Math.random() > 0.7;
      colors[i3] = isBlue ? 0.7 : 1.0;
      colors[i3 + 1] = isBlue ? 0.8 : 0.95;
      colors[i3 + 2] = 1.0;

      phases[i] = Math.random() * Math.PI * 2;
      frequencies[i] = 0.5 + Math.random() * 2.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aFrequency', new THREE.BufferAttribute(frequencies, 1));

    // 使用 ShaderMaterial 将闪烁计算迁移到 GPU，避免每帧 CPU 遍历
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 6.0 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aPhase;
        attribute float aFrequency;
        uniform float uTime;
        uniform float uSize;
        varying vec3 vColor;
        varying vec3 vViewDir;
        void main() {
          float twinkle = 0.5 + sin(uTime * aFrequency + aPhase) * 0.5;
          float factor = 0.7 + twinkle * 0.3;
          vColor = aColor * factor;
          // v23: 屏幕空间方向（用于衍射尖峰定向）
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(mvPos.xyz);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying vec3 vViewDir;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv);
          float core = exp(-dist * dist * 200.0) * 1.5;

          // v23: 衍射尖峰 — 4条主光芒（望远镜/人眼光学效果）
          float angle = atan(uv.y, uv.x);
          float viewAngle = atan(vViewDir.y, vViewDir.x);
          float ca = cos(viewAngle), sa = sin(viewAngle);
          float rx = uv.x * ca + uv.y * sa;
          float ry = -uv.x * sa + uv.y * ca;
          float angleR = atan(ry, rx);
          float spikes = pow(abs(sin(angleR * 2.0)), 24.0) * exp(-dist * 5.0) * 0.6;
          spikes += pow(abs(sin(angleR * 2.0 + 0.785)), 28.0) * exp(-dist * 6.0) * 0.4;
          // 微弱随机散射光芒
          float scatter = pow(abs(sin(angleR * 5.0 + 1.2)), 20.0) * exp(-dist * 8.0) * 0.15;

          float halo = exp(-dist * dist * 12.0) * 0.4;
          float alpha = core + halo + spikes + scatter;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor * alpha, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.userData.isBrightStar = true;

    scene.add(points);
    this.meshes.push(points);
    this.materials.push(material);
    this.geometries.push(geometry);
    this.brightStars.push({ points, material });
  }

  // v25: 银河系 — 对数螺旋四层结构（核球+旋臂+尘埃+银晕）
  // v26: targetGroup 为挂载父节点（galaxyCenterGroup），与太阳系共享倾斜基准
  createMilkyWay(scene, targetGroup, spread) {
    const galaxyCfg = config.stars.galaxy || {};
    const count = galaxyCfg.count || 40000;
    const armCount = galaxyCfg.armCount || 4;
    const spin = galaxyCfg.spin || 4.5;
    const armSpread = galaxyCfg.armSpread || 0.12;
    const tiltDeg = galaxyCfg.tilt || 50;
    const galaxyScale = galaxyCfg.scale || 22.0;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);

    const galaxyRadius = spread * 0.5 * galaxyScale;
    const armLength = galaxyRadius * 0.85;
    const thickness = galaxyRadius * 0.03;

    // v25: 四层粒子数
    const coreBulgeCount = Math.floor(count * (galaxyCfg.coreBulgeRatio || 0.12));
    const armCount_ = Math.floor(count * (galaxyCfg.armRatio || 0.55));
    const dustCount = Math.floor(count * (galaxyCfg.dustRatio || 0.15));
    const haloCount = count - coreBulgeCount - armCount_ - dustCount;
    const bulgeR = armLength * (galaxyCfg.bulgeRadius || 0.08);
    const bulgeBrightness = galaxyCfg.bulgeBrightness || 2.0;
    const armWiden = galaxyCfg.armWidenFactor || 0.08;

    // 对数螺旋参数: r = a * exp(b * theta)
    // 设定: theta=0时r=bulgeR, theta=2PI时r=armLength
    const b = Math.log(armLength / bulgeR) / (Math.PI * 2.5);
    const a = bulgeR / Math.exp(0);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      let x, y, z;

      if (i < coreBulgeCount) {
        // ===== 层1: 核球 — v25-fix: 更小更暗 =====
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.pow(Math.random(), 2.5) * bulgeR; // v25-fix: pow(2.5)更集中到中心
        x = Math.cos(theta) * Math.sin(phi) * r;
        z = Math.sin(theta) * Math.sin(phi) * r;
        y = Math.cos(phi) * r * 0.15; // v25-fix: 更扁（0.25→0.15）

        // v25-fix: 核球颜色压暗（暖金白，但light降低）
        const hue = 0.1 + Math.random() * 0.04;
        const sat = 0.15 + Math.random() * 0.15;
        const light = 0.55 + Math.random() * 0.20; // v25-fix: light从0.75降到0.55
        const c = new THREE.Color().setHSL(hue, sat, light);
        colors[i3] = c.r * bulgeBrightness * 0.7; // v25-fix: 额外压暗30%
        colors[i3 + 1] = c.g * bulgeBrightness * 0.7;
        colors[i3 + 2] = c.b * bulgeBrightness * 0.7;
        sizes[i] = 0.15 + Math.random() * 0.35; // v25-fix: 粒子更小

      } else if (i < coreBulgeCount + armCount_) {
        // ===== 层2: 旋臂主星 — 对数螺旋分布 =====
        const armIdx = (i - coreBulgeCount) % armCount;
        const armAngle = (armIdx / armCount) * Math.PI * 2;

        // 对数螺旋半径
        const t = Math.pow(Math.random(), 0.6); // 0-1，内密外疏
        const theta = t * Math.PI * 2.5; // 旋臂缠绕2.5圈
        const r = a * Math.exp(b * theta);

        // 旋臂渐宽：越远散射越大
        const scatterAngle = gaussianRandom(0, armSpread + r * armWiden / armLength);
        const scatterR = gaussianRandom(0, r * (armSpread * 0.3 + r * armWiden * 0.5 / armLength));
        const angle = armAngle + theta + scatterAngle;

        x = Math.cos(angle) * (r + scatterR);
        z = Math.sin(angle) * (r + scatterR);
        y = gaussianRandom(0, thickness * (0.3 + t * 0.7));

        // v25: 连续颜色渐变 — 银心暖金→中段蓝白→外段冷蓝
        const normR = r / armLength;
        let hue, sat, light;
        if (normR < 0.15) {
          hue = 0.10; sat = 0.15; light = 0.80; // 暖金
        } else if (normR < 0.45) {
          const blend = (normR - 0.15) / 0.30;
          hue = 0.10 + blend * 0.48; // 金→蓝
          sat = 0.15 + blend * 0.10;
          light = 0.80 - blend * 0.20;
        } else {
          const blend = Math.min((normR - 0.45) / 0.55, 1.0);
          hue = 0.58 + blend * 0.04;
          sat = 0.25 + blend * 0.15;
          light = 0.60 - blend * 0.25;
        }
        const c = new THREE.Color().setHSL(hue + Math.random() * 0.03, sat, light + Math.random() * 0.15);
        colors[i3] = c.r * 1.1; colors[i3 + 1] = c.g * 1.1; colors[i3 + 2] = c.b * 1.1; // v26: 旋臂亮度+10%
        sizes[i] = 0.12 + t * 0.25;

      } else if (i < coreBulgeCount + armCount_ + dustCount) {
        // ===== 层3: 尘埃暗带 — 沿旋臂分布的暗红褐色 =====
        const armIdx = (i - coreBulgeCount - armCount_) % armCount;
        const armAngle = (armIdx / armCount) * Math.PI * 2;
        const t = Math.pow(Math.random(), 0.5);
        const theta = t * Math.PI * 2.5;
        const r = a * Math.exp(b * theta);

        // 尘埃比恒星散射更大，形成暗带
        const scatterAngle = gaussianRandom(0, armSpread * 1.8);
        const scatterR = gaussianRandom(0, r * armSpread * 0.6);
        const angle = armAngle + theta + scatterAngle + 0.15; // 略偏旋臂一侧

        x = Math.cos(angle) * (r + scatterR);
        z = Math.sin(angle) * (r + scatterR);
        y = gaussianRandom(0, thickness * 0.2);

        // 暗红褐色（消光尘埃），v26.2: 压暗15%强化旋臂间对比
        const c = new THREE.Color().setHSL(0.05 + Math.random() * 0.08, 0.3 + Math.random() * 0.2, 0.06 + Math.random() * 0.06);
        colors[i3] = c.r * 0.85; colors[i3 + 1] = c.g * 0.85; colors[i3 + 2] = c.b * 0.85;
        sizes[i] = 0.06 + Math.random() * 0.12;

      } else {
        // ===== 层4: 银晕 — v25-fix: 极扁盘状分布，不是球 =====
        const theta = Math.random() * Math.PI * 2;
        // v25-fix: 用二维正态分布，Y轴极扁
        const r2d = Math.sqrt(-2 * Math.log(1 - Math.random() * 0.999)) * armLength * 0.7;
        const angle = theta + Math.random() * 0.3;
        x = Math.cos(angle) * r2d;
        z = Math.sin(angle) * r2d;
        // v25-fix: Y轴极度压缩（从0.4降到0.08），形成薄盘
        y = gaussianRandom(0, thickness * 0.08);

        // 冷蓝白色（古老恒星），降低亮度突出旋臂
        const c = new THREE.Color().setHSL(0.58 + Math.random() * 0.06, 0.08 + Math.random() * 0.12, 0.35 + Math.random() * 0.25);
        colors[i3] = c.r * 0.55; colors[i3 + 1] = c.g * 0.55; colors[i3 + 2] = c.b * 0.55; // v26: 银晕压暗
        sizes[i] = 0.05 + Math.random() * 0.12; // v25-fix: 粒子更小
      }

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
      randoms[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCoreRotSpeed: { value: 0.008 },
        uRadiusFalloff: { value: 0.00004 },
        uTimeScale: { value: 1.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float aRandom;
        uniform float uTime;
        uniform float uCoreRotSpeed;
        uniform float uRadiusFalloff;
        uniform float uTimeScale;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          float r = length(position.xz) + 0.01;
          float localSpeed = uCoreRotSpeed / (0.1 + r * uRadiusFalloff);
          float angle = uTime * localSpeed * uTimeScale;
          float cosA = cos(angle);
          float sinA = sin(angle);
          vec3 pos = position;
          float rx = pos.x * cosA - pos.z * sinA;
          float rz = pos.x * sinA + pos.z * cosA;
          pos.x = rx;
          pos.z = rz;
          float corePulse = 1.0 + sin(uTime * 1.5) * 0.1 / (r * 0.0001 + 0.5);
          vAlpha = (0.6 + sin(uTime * (0.5 + aRandom * 2.0) + aRandom * 6.28) * 0.3) * corePulse;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
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
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.galaxyMaterial = material;

    const points = new THREE.Points(geometry, material);
    points.userData.isGalaxy = true;

    const galaxyGroup = new THREE.Group();
    // v26: 位置由 galaxyCenterGroup 统一管理，倾斜上移到 scene.js 的 galaxyCenterGroup.rotation.x
    galaxyGroup.add(points);
    targetGroup.add(galaxyGroup);

    this.meshes.push(galaxyGroup);
    this.materials.push(material);
    this.geometries.push(geometry);

    this.createGalaxyHaze(scene, galaxyGroup, armCount, spin, armLength, thickness, galaxyScale, tiltDeg);
  }

  // v25-fix: 银河雾气层 — 改用对数螺旋 + 扁平化 + 径向衰减
  createGalaxyHaze(scene, galaxyGroup, armCount, spin, armLength, thickness, galaxyScale, tiltDeg) {
    const hazeCount = config.stars.galaxy?.hazeCount || 3000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(hazeCount * 3);
    const col = new Float32Array(hazeCount * 3);

    // v25-fix: 复用对数螺旋参数，让雾气沿旋臂分布
    const b = Math.log(armLength * 0.8 / (armLength * 0.06)) / (Math.PI * 2.5);
    const a = (armLength * 0.06);

    for (let i = 0; i < hazeCount; i++) {
      const i3 = i * 3;
      const branchIndex = i % armCount;
      const branchAngle = (branchIndex / armCount) * Math.PI * 2;

      // v25-fix: 对数螺旋半径（与主旋臂同步）
      const t = Math.pow(Math.random(), 0.6);
      const theta = t * Math.PI * 2.5;
      const r = a * Math.exp(b * theta);

      // v25-fix: 散射更小（0.08→0.05），雾气更贴合旋臂
      const scatterAngle = gaussianRandom(0, 0.08);
      const scatterR = gaussianRandom(0, r * 0.06);
      const angle = branchAngle + theta + scatterAngle;

      pos[i3]     = Math.cos(angle) * (r + scatterR);
      pos[i3 + 1] = gaussianRandom(0, thickness * 0.3); // v25-fix: 厚度减半
      pos[i3 + 2] = Math.sin(angle) * (r + scatterR);

      // 暖棕色雾气（低饱和度，避免抢眼）
      const c = new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.12 + Math.random() * 0.1, 0.25 + Math.random() * 0.2);
      col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // v25-fix: ShaderMaterial — 旋臂同步旋转 + 粒子大小衰减
    const hazeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCoreRotSpeed: { value: 0.008 },
        uRadiusFalloff: { value: 0.00004 },
        uTimeScale: { value: 1.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uCoreRotSpeed;
        uniform float uRadiusFalloff;
        uniform float uTimeScale;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          float r = length(position.xz) + 0.01;
          // v25-fix: 差速旋转（内快外慢）
          float localSpeed = uCoreRotSpeed / (0.1 + r * uRadiusFalloff);
          float angle = uTime * localSpeed * uTimeScale;
          float cosA = cos(angle), sinA = sin(angle);
          vec3 pos = position;
          pos.x = position.x * cosA - position.z * sinA;
          pos.z = position.x * sinA + position.z * cosA;
          // v25-fix: 径向衰减——内亮外暗，避免球形均匀感
          float radialFade = 1.0 - smoothstep(0.0, 0.8, r / (length(vec3(1.0, 0.0, 1.0)) * 5000.0));
          vAlpha = 0.13 * radialFade; // v26: 增强雾气可见性
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          // v25-fix: 粒子大小随距离衰减（近大远小）
          gl_PointSize = (2.5 + radialFade * 2.5) * uPixelRatio * (300.0 / -mvPosition.z);
          gl_PointSize = clamp(gl_PointSize, 0.5, 4.0);
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
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const hazePoints = new THREE.Points(geo, hazeMat);
    hazePoints.userData.isGalaxyHaze = true;
    this.hazePoints = hazePoints; // v26: 保存引用供自适应画质
    galaxyGroup.add(hazePoints);
    this.meshes.push(hazePoints);
    this.materials.push(hazeMat);
    this.geometries.push(geo);
  }

  update(delta, elapsed) {
    // 亮星闪烁 + 银河 + 雾气：更新所有 ShaderMaterial 的 uTime
    this.brightStars.forEach(({ material }) => {
      if (material.uniforms) material.uniforms.uTime.value = elapsed;
    });

    if (this.galaxyMaterial?.uniforms) {
      this.galaxyMaterial.uniforms.uTime.value = elapsed;
    }

    // v19.5: 银河雾气 ShaderMaterial 同步旋转
    this.materials.forEach((m) => {
      if (m.uniforms?.uTime && m !== this.galaxyMaterial) {
        m.uniforms.uTime.value = elapsed;
        if (m.uniforms.uTimeScale) m.uniforms.uTimeScale.value = config.galaxyMotion?.timeScale || 1.0;
        if (m.uniforms.uCoreRotSpeed) m.uniforms.uCoreRotSpeed.value = config.galaxyMotion?.coreRotSpeed || 0.008;
        if (m.uniforms.uRadiusFalloff) m.uniforms.uRadiusFalloff.value = config.galaxyMotion?.radiusFalloff || 0.00004;
      }
    });
  }

  // v30: 银河核球全息体积辉光 — 指数衰减 ShaderMaterial 球体
  createGalaxyCoreGlow(group) {
    const galaxyCfg = config.stars.galaxy || {};
    const spread = config.stars.spread || 100000;
    const galaxyScale = galaxyCfg.scale || 22.0;
    const galaxyRadius = spread * 0.5 * galaxyScale;
    const armLength = galaxyRadius * 0.85;
    const bulgeR = armLength * (galaxyCfg.bulgeRadius || 0.08);

    // 辉光半径至少能覆盖到太阳系附近（相机初始位置在 ≈22k 处可见）
    const glowRadius = Math.max(bulgeR * 6, 40000);
    const geometry = new THREE.SphereGeometry(glowRadius, 32, 24);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(0xffdd88) },
        uColor2: { value: new THREE.Color(0xffaa44) },
        uGlowPower: { value: 2.0 },
        uOpacity: { value: 0.3 },
        uPulseSpeed: { value: 0.3 },
        uFalloff: { value: 2.5 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vHeight;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          vHeight = length(position) / ${glowRadius.toFixed(1)};
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uGlowPower;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uPulseSpeed;
        uniform float uFalloff;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vHeight;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          // 相机位于辉光球内部时，BackSide 的法线与视线相反；使用绝对值只保留掠射角边缘，避免整屏被加法混合刷白
          float rim = 1.0 - abs(dot(viewDir, vNormal));
          // 体积衰减：指数衰减 + 边缘增强
          float glow = rim * pow(rim, uGlowPower) * 1.5 + exp(-vHeight * uFalloff) * 1.0;
          float pulse = 1.0 + 0.06 * sin(uTime * uPulseSpeed);
          vec3 color = mix(uColor2, uColor1, smoothstep(0.0, 0.6, glow));
          gl_FragColor = vec4(color * glow * 2.0 * pulse, glow * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    this.meshes.push(mesh);
    this.materials.push(material);
    console.log('[StarField] 核球辉光已添加, radius:', glowRadius.toFixed(0));
  }

  dispose(scene) {
    this.meshes.forEach((m) => scene.remove(m));
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.meshes = [];
    this.geometries = [];
    this.materials = [];
    this.brightStars = [];
  }
}
