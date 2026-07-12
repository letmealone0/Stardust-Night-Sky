/**
 * 彗星系统 v1.0
 * 太阳系内 4 颗标志性周期彗星：
 *   哈雷(1P)、海尔-波普(C/1995 O1)、恩克(2P)、斯威夫特-塔特尔(109P)
 * 开普勒椭圆轨道 + 双尾（尘埃尾/离子尾）+ 彗发辉光
 */

import * as THREE from 'three';

// ==================== 彗星数据 ====================
// a=半长轴, e=偏心率, i=倾角(度), ω=近日点幅角(度), periodDays=周期(天)
const COMET_DATA = [
  {
    id: 'halley', name: '1P/Halley', nameCN: '哈雷彗星',
    a: 2200, e: 0.967, i: 162, ω: 111, periodDays: 76 * 365,
    nucleusRadius: 1.8, comaIr: 6, comaOr: 20,
    dustLen: 400, dustHalfW: 3.5, ionLen: 520, ionHalfW: 1.2,
    dustColor: [0.92, 0.78, 0.45],
    ionColor: [0.22, 0.48, 0.92],
  },
  {
    id: 'halebopp', name: 'C/1995 O1', nameCN: '海尔-波普彗星',
    a: 3000, e: 0.995, i: 89, ω: 130, periodDays: 2500 * 365,
    nucleusRadius: 2.5, comaIr: 10, comaOr: 35,
    dustLen: 650, dustHalfW: 5.0, ionLen: 800, ionHalfW: 1.6,
    dustColor: [0.95, 0.82, 0.55],
    ionColor: [0.20, 0.42, 0.95],
  },
  {
    id: 'encke', name: '2P/Encke', nameCN: '恩克彗星',
    a: 1500, e: 0.848, i: 12, ω: 186, periodDays: 3.3 * 365,
    nucleusRadius: 1.3, comaIr: 4, comaOr: 12,
    dustLen: 250, dustHalfW: 2.2, ionLen: 350, ionHalfW: 0.9,
    dustColor: [0.88, 0.72, 0.40],
    ionColor: [0.25, 0.50, 0.88],
  },
  {
    id: 'swifttuttle', name: '109P/Swift-Tuttle', nameCN: '斯威夫特-塔特尔彗星',
    a: 2600, e: 0.963, i: 113, ω: 153, periodDays: 133 * 365,
    nucleusRadius: 2.0, comaIr: 7, comaOr: 25,
    dustLen: 450, dustHalfW: 4.0, ionLen: 600, ionHalfW: 1.3,
    dustColor: [0.90, 0.75, 0.48],
    ionColor: [0.23, 0.45, 0.90],
  },
];

// 游戏时间缩放（复用 solarSystem 的 TIME_SCALE）
const TIME_SCALE = 30; // 1秒=30天

export class CometSystem {
  constructor() {
    this.group = new THREE.Group();
    this.comets = [];
    // 缓存向量，避免每帧 new
    this._tmpVec = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
  }

  // ==================== 初始化 ====================
  init(solarSystemGroup) {
    this._solarGroup = solarSystemGroup;
    COMET_DATA.forEach((data) => this._createComet(data));
    solarSystemGroup.add(this.group);
    console.log(`[Comets] v1.0 ${COMET_DATA.length}颗彗星初始化完成`);
  }

  // ==================== 创建单颗彗星 ====================
  _createComet(data) {
    const comet = { data };

    // 主容器
    comet.group = new THREE.Group();
    comet.group.name = data.name;

    // --- 彗核：小亮球 ---
    comet.nucleus = this._createNucleus(data);

    // --- 彗发：双层辉光球 ---
    comet.comaInner = this._createComaGlow(data.comaIr, data.dustColor, 1.0);
    comet.comaOuter = this._createComaGlow(data.comaOr, data.dustColor, 0.35);

    // --- 尾部组（每帧旋转背离太阳）---
    comet.tailGroup = new THREE.Group();

    // 尘埃尾：暖色宽弧带
    comet.dustTail = this._createTailRibbon(
      data.dustLen, data.dustHalfW, 60, data.dustColor, 0.18, 0.0008
    );

    // 离子尾：蓝色细直带
    comet.ionTail = this._createTailRibbon(
      data.ionLen, data.ionHalfW, 40, data.ionColor, 0.12, 0
    );

    comet.tailGroup.add(comet.dustTail);
    comet.tailGroup.add(comet.ionTail);

    comet.group.add(comet.nucleus);
    comet.group.add(comet.comaInner);
    comet.group.add(comet.comaOuter);
    comet.group.add(comet.tailGroup);

    // 初始平均近点角：随机散布，避免所有彗星从同一位置出发
    comet.M0 = Math.random() * Math.PI * 2;

    this.group.add(comet.group);
    this.comets.push(comet);
  }

  // ==================== 彗核 ====================
  _createNucleus(data) {
    const geo = new THREE.SphereGeometry(data.nucleusRadius, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    return new THREE.Mesh(geo, mat);
  }

  // ==================== 彗发辉光球 ====================
  _createComaGlow(radius, colorArr, intensity) {
    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(colorArr[0], colorArr[1], colorArr[2]) },
        uIntensity: { value: intensity },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        uniform vec3 uColor;
        uniform float uIntensity;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
          float alpha = pow(rim, 2.5) * uIntensity;
          alpha = clamp(alpha, 0.0, 1.0);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor * 0.7, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  // ==================== 尾部 Ribbon 几何体 ====================
  // curvature: 0 = 直尾(离子尾), >0 = 抛物线弯曲(尘埃尾)
  _createTailRibbon(length, halfWidth, segments, colorArr, maxAlpha, curvature) {
    const vertCount = (segments + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const RGBA = new Float32Array(vertCount * 4);
    const indices = [];

    const [cr, cg, cb] = colorArr;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -t * length; // 沿 -Z 延伸（背离太阳方向）
      const w = halfWidth * (1.0 - t * 0.75); // 根部宽→远端收窄
      const curveX = curvature * z * z; // 抛物线弯曲（仅尘埃尾）

      // 左顶点
      const li = i * 2;
      positions[li * 3] = -w + curveX;
      positions[li * 3 + 1] = 0;
      positions[li * 3 + 2] = z;

      const alphaL = maxAlpha * (1.0 - t * t);
      RGBA[li * 4] = cr;
      RGBA[li * 4 + 1] = cg;
      RGBA[li * 4 + 2] = cb;
      RGBA[li * 4 + 3] = alphaL;

      // 右顶点
      const ri = i * 2 + 1;
      positions[ri * 3] = w + curveX;
      positions[ri * 3 + 1] = 0;
      positions[ri * 3 + 2] = z;

      const alphaR = maxAlpha * (1.0 - t * t);
      RGBA[ri * 4] = cr;
      RGBA[ri * 4 + 1] = cg;
      RGBA[ri * 4 + 2] = cb;
      RGBA[ri * 4 + 3] = alphaR;

      // 三角形索引
      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);      // 左→右→左下
        indices.push(base + 1, base + 3, base + 2);  // 右→右下→左下
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRGBA', new THREE.BufferAttribute(RGBA, 4));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 aRGBA;
        varying vec4 vColor;
        void main() {
          vColor = aRGBA;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec4 vColor;
        void main() {
          if (vColor.a < 0.003) discard;
          gl_FragColor = vColor;
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geo, mat);
  }

  // ==================== 开普勒方程求解 ====================
  // 返回 { position: Vector3 }（相对于太阳的位置）
  _solveKepler(data, M) {
    // Newton-Raphson: E_{n+1} = E_n - (E_n - e*sin(E_n) - M) / (1 - e*cos(E_n))
    let E = M;
    for (let i = 0; i < 6; i++) {
      const dE = (E - data.e * Math.sin(E) - M) / (1 - data.e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }

    // 真近点角
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const sqrt1me2 = Math.sqrt(1 - data.e * data.e);
    const theta = Math.atan2(sqrt1me2 * sinE, cosE - data.e);

    // 极坐标半径
    const r = data.a * (1 - data.e * cosE);

    // 轨道面 2D → 3D（绕Z旋转近日点幅角，再绕X倾斜轨道面）
    const trueAngle = theta + THREE.MathUtils.degToRad(data.ω);
    const cosA = Math.cos(trueAngle);
    const sinA = Math.sin(trueAngle);
    const cosI = Math.cos(THREE.MathUtils.degToRad(data.i));
    const sinI = Math.sin(THREE.MathUtils.degToRad(data.i));

    return new THREE.Vector3(
      r * cosA,
      r * sinA * cosI,
      r * sinA * sinI
    );
  }

  // ==================== 每帧更新 ====================
  update(delta, elapsed) {
    for (const comet of this.comets) {
      const d = comet.data;

      // 计算平近点角（弧度）
      const daysElapsed = elapsed * TIME_SCALE;
      const M = (comet.M0 + (daysElapsed / d.periodDays) * Math.PI * 2) % (Math.PI * 2);

      // 求解开普勒方程 → 位置
      const pos = this._solveKepler(d, M);

      // 更新彗星位置（相对太阳原点）
      comet.group.position.copy(pos);

      // 尾部指向背离太阳（尾沿 -Z 延伸，lookAt 太阳使 +Z 指向太阳 → -Z 背离太阳）
      this._lookTarget.set(0, 0, 0);
      comet.tailGroup.lookAt(this._lookTarget);

      // 彗发脉动微动
      const pulse = 1.0 + Math.sin(elapsed * 3.0 + comet.M0) * 0.06;
      comet.comaInner.scale.setScalar(pulse);
      comet.comaOuter.scale.setScalar(pulse * 0.95);
    }
  }

  // ==================== 清理 ====================
  dispose() {
    for (const comet of this.comets) {
      comet.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.comets = [];
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
