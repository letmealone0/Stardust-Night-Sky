/**
 * 彗星系统 v3.0
 * v3.0: 流动幅度加大+速度分层 + 尾部横向扰动 + 宽度反转(根窄尖宽)
 *       + 彗发噪声加速+多层 + 粒子速度/数量提升+横向扩散
 *       + 整体亮度脉动 + 离子尾独立快速动态 + 活跃度联动
 */

import * as THREE from 'three';

const COMET_DATA = [
  {
    id: 'halley', name: '1P/Halley', nameCN: '哈雷彗星',
    lastPerihelionMs: Date.UTC(1986, 1, 9),
    a: 6200, e: 0.967, i: 162, ω: 111, periodDays: 27759,
    nucleusRadius: 1.8, comaRadius: 18,
    dustLen: 450, dustHalfW: 4.8, ionLen: 550, ionHalfW: 0.7,
    dustInner: [0.90, 0.78, 0.52], dustOuter: [0.85, 0.68, 0.38],
    ionColor: [0.16, 0.52, 0.92],
    perihelion: 204.6,
  },
  {
    id: 'halebopp', name: 'C/1995 O1', nameCN: '海尔-波普彗星',
    lastPerihelionMs: Date.UTC(1997, 3, 1),
    a: 8000, e: 0.975, i: 89, ω: 130, periodDays: 912500,
    nucleusRadius: 2.5, comaRadius: 30,
    dustLen: 700, dustHalfW: 7.2, ionLen: 850, ionHalfW: 1.0,
    dustInner: [0.92, 0.80, 0.55], dustOuter: [0.87, 0.70, 0.40],
    ionColor: [0.14, 0.48, 0.93],
    perihelion: 200.0,
  },
  {
    id: 'encke', name: '2P/Encke', nameCN: '恩克彗星',
    lastPerihelionMs: Date.UTC(2023, 9, 22),
    a: 1500, e: 0.848, i: 12, ω: 186, periodDays: 1205,
    nucleusRadius: 1.3, comaRadius: 10,
    dustLen: 280, dustHalfW: 3.0, ionLen: 380, ionHalfW: 0.5,
    dustInner: [0.88, 0.74, 0.48], dustOuter: [0.82, 0.64, 0.35],
    ionColor: [0.18, 0.52, 0.88],
    perihelion: 228.0,
  },
  {
    id: 'swifttuttle', name: '109P/Swift-Tuttle', nameCN: '斯威夫特-塔特尔彗星',
    lastPerihelionMs: Date.UTC(1992, 11, 11),
    a: 5500, e: 0.963, i: 113, ω: 153, periodDays: 48545,
    nucleusRadius: 2.0, comaRadius: 22,
    dustLen: 500, dustHalfW: 5.4, ionLen: 650, ionHalfW: 0.77,
    dustInner: [0.90, 0.76, 0.50], dustOuter: [0.84, 0.66, 0.38],
    ionColor: [0.15, 0.50, 0.91],
    perihelion: 203.5,
  },
];

const TIME_SCALE = 30;
const LOD_FAR = 8000;
const LOD_VERY_FAR = 20000;
const CLOSE_PARTICLE_DIST = 200;
const DUST_FLOW = 1.0;   // 尘埃尾流速基数
const ION_FLOW = 1.8;     // 离子尾流速更快

export class CometSystem {
  constructor() {
    this.group = new THREE.Group();
    this.comets = [];
    this._camera = null;
    this._tailQ = new THREE.Quaternion();
    this._tailFrom = new THREE.Vector3(0, 0, 1);
    this._tailTo = new THREE.Vector3();
    this._tmpWorld = new THREE.Vector3();
    this._orbitPos = new THREE.Vector3();
  }

  setCamera(camera) { this._camera = camera; }

  init(solarSystemGroup) {
    COMET_DATA.forEach((data) => this._createComet(data));
    solarSystemGroup.add(this.group);
    console.log(`[Comets] v3.0 ${COMET_DATA.length}颗彗星`);
  }

  // ==================== 创建单颗彗星 ====================
  _createComet(data) {
    const comet = { data, tailMeshes: [] };
    comet.group = new THREE.Group();
    comet.group.name = data.name;
    comet.tailGroup = new THREE.Group();

    comet.nucleus = this._createNucleus(data);
    comet.group.add(comet.nucleus);

    comet.closeParticles = this._createCloseParticles(data);
    comet.tailGroup.add(comet.closeParticles);

    comet.coma = this._createComa(data);
    comet.group.add(comet.coma);

    const curve = 0.0015;

    // ---- 尘埃尾：3层×十字=6条（flowSpeed=1.0，慢）----
    this._addTailPair(comet, data.dustLen, data.dustHalfW * 0.55, 60,
      data.dustInner, 0.18, curve, DUST_FLOW);
    this._addTailPair(comet, data.dustLen, data.dustHalfW * 1.0, 60,
      data.dustOuter, 0.08, curve, DUST_FLOW);
    this._addTailPair(comet, data.dustLen, data.dustHalfW * 2.5, 48,
      data.dustOuter, 0.03, curve * 0.6, DUST_FLOW);

    // ---- 离子尾：1层×十字=2条（flowSpeed=1.8，快速锐利）----
    this._addTailPair(comet, data.ionLen, data.ionHalfW, 36,
      data.ionColor, 0.14, 0, ION_FLOW);

    comet.group.add(comet.tailGroup);

    // 实时 M0
    const nowMs = Date.now();
    const elapsedDays = (nowMs - data.lastPerihelionMs) / 86400000;
    const frac = (elapsedDays % data.periodDays) / data.periodDays;
    comet.M0 = frac * Math.PI * 2;

    this.group.add(comet.group);
    this.comets.push(comet);
  }

  _addTailPair(comet, length, halfW, segs, color, alpha, curve, flowSpeed) {
    const main = this._createTailRibbon(length, halfW, segs, color, alpha, curve, flowSpeed);
    const cross = this._createTailRibbon(length, halfW, segs, color, alpha * 0.55, curve, flowSpeed);
    cross.rotation.z = Math.PI / 2;
    comet.tailGroup.add(main);
    comet.tailGroup.add(cross);
    comet.tailMeshes.push(main, cross);
  }

  // ==================== 彗核 ====================
  _createNucleus(data) {
    const geo = new THREE.SphereGeometry(data.nucleusRadius, 14, 14);
    const mat = new THREE.MeshBasicMaterial({ color: 0x787066 });
    const mesh = new THREE.Mesh(geo, mat);
    // 微散射光环
    const haloGeo = new THREE.SphereGeometry(data.nucleusRadius * 2.5, 12, 12);
    const haloMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec3 vLocalPos;
        void main() { vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `precision highp float; varying vec3 vLocalPos;
        void main() { float r = length(vLocalPos) / 1.0;
          float alpha = exp(-r * r * 4.0) * 0.08;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(0.55, 0.45, 0.35, alpha); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    mesh.add(new THREE.Mesh(haloGeo, haloMat));
    return mesh;
  }

  // ==================== 彗发：加速噪声 + 多层 + 向阳脉动 ====================
  _createComa(data) {
    const geo = new THREE.SphereGeometry(data.comaRadius, 36, 36);
    const colorArr = data.dustInner;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(colorArr[0], colorArr[1], colorArr[2]) },
        uActivity: { value: 1.0 },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec3 vNormal; varying vec3 vWorldPos; varying vec3 vLocalPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz; vLocalPos = position;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `precision highp float;
        varying vec3 vNormal; varying vec3 vWorldPos; varying vec3 vLocalPos;
        uniform vec3 uColor; uniform float uActivity; uniform float uTime;
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float r = length(vLocalPos) / 1.0;
          float density = exp(-r * r * 2.8);
          // v3.0: 噪声加速 0.25→1.3，叠加高频细噪声
          float noise1 = (hash(vLocalPos * 2.5 + uTime * 1.3) - 0.5) * 0.22;
          float noise2 = (hash(vLocalPos * 5.0 + uTime * 2.0) - 0.5) * 0.10;
          density *= (1.0 + noise1 + noise2);
          // 向阳增亮
          float sunFace = smoothstep(-0.3, 0.3, -vLocalPos.z);
          // v3.0: 向阳面微弱脉动，模拟冰升华不稳定
          float pulse = 1.0 + sin(uTime * 2.2 + sunFace * 3.0) * 0.06;
          float sunBoost = (1.0 + sunFace * 0.22) * pulse;
          // 菲涅尔边缘
          float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
          float rimAlpha = pow(rim, 3.2) * 0.2;
          float alpha = (density * 0.5 + rimAlpha) * sunBoost * uActivity;
          alpha = clamp(alpha, 0.0, 1.0);
          if (alpha < 0.003) discard;
          // v3.0: 整体亮度 ±5% 缓慢脉动
          float globalPulse = 1.0 + sin(uTime * 0.8) * 0.05;
          vec3 col = uColor * (density * 1.0 * sunBoost + rimAlpha * 0.15) * globalPulse;
          gl_FragColor = vec4(col, alpha);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.material = mat;
    return mesh;
  }

  // ==================== 尾部 Ribbon（v3.0 重构）====================
  _createTailRibbon(length, halfWidth, segments, colorArr, maxAlpha, curvature, flowSpeed) {
    const vertCount = (segments + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const RGBA = new Float32Array(vertCount * 4);
    const indices = [];
    const [cr, cg, cb] = colorArr;

    // v3.0: 宽度反转 — 根部窄(0.25×)、远端扩散变宽(1.0×)
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -t * length;
      const w = halfWidth * (0.25 + t * 0.75);
      const curveX = curvature * z * z;
      const tailAlpha = maxAlpha * Math.pow(Math.max(1.0 - t, 0.001), 2.2);

      const li = i * 2;
      positions[li * 3] = -w + curveX; positions[li * 3 + 1] = 0; positions[li * 3 + 2] = z;
      RGBA[li * 4] = cr; RGBA[li * 4 + 1] = cg; RGBA[li * 4 + 2] = cb; RGBA[li * 4 + 3] = tailAlpha;

      const ri = i * 2 + 1;
      positions[ri * 3] = w + curveX; positions[ri * 3 + 1] = 0; positions[ri * 3 + 2] = z;
      RGBA[ri * 4] = cr; RGBA[ri * 4 + 1] = cg; RGBA[ri * 4 + 2] = cb; RGBA[ri * 4 + 3] = tailAlpha;

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRGBA', new THREE.BufferAttribute(RGBA, 4));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHalfWidth: { value: halfWidth },
        uActivity: { value: 1.0 },
        uTime: { value: 0 },
        uFlowSpeed: { value: flowSpeed || 1.0 },
      },
      // v3.0: 顶点着色器 — 横向摆动（低频摇摆+高频抖动）
      vertexShader: `attribute vec4 aRGBA;
        varying vec4 vColor; varying float vDistX; varying float vLocalZ;
        uniform float uTime; uniform float uActivity; uniform float uHalfWidth;
        void main() {
          vec3 pos = position;
          float sway = sin(pos.z * 0.005 + uTime * 1.2) * uHalfWidth * 0.12;
          float flutter = sin(pos.z * 0.035 - uTime * 4.5) * cos(pos.z * 0.022 + uTime * 2.0) * uHalfWidth * 0.05;
          pos.x += (sway + flutter) * uActivity;
          vColor = aRGBA;
          vDistX = pos.x;
          vLocalZ = pos.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      // v3.0: 片元着色器 — 大幅流动+速度分层+亮度脉动+活跃联动
      fragmentShader: `precision highp float;
        varying vec4 vColor; varying float vDistX; varying float vLocalZ;
        uniform float uHalfWidth; uniform float uActivity; uniform float uTime;
        uniform float uFlowSpeed;
        void main() {
          float edgeFade = exp(-pow(abs(vDistX) / max(uHalfWidth * 0.65, 0.001), 2.0) * 2.8);
          // v3.0: 主波(0.18) + 次波(0.08) + 湍流(0.06) → 总幅度±0.32
          float wave1 = sin(vLocalZ * 0.02 - uTime * 3.5 * uFlowSpeed) * 0.18;
          float wave2 = sin(vLocalZ * 0.045 + uTime * 2.2 * uFlowSpeed) * 0.08;
          float turbulence = sin(vLocalZ * 0.08 - uTime * 5.0 * uFlowSpeed) * cos(vLocalZ * 0.06 + uTime * 3.0 * uFlowSpeed) * 0.06;
          // v3.0: 活跃度联动 — 近日点流动更强
          float dynAmp = 0.5 + 0.5 * uActivity;
          float flow = 0.85 + (wave1 + wave2 + turbulence) * dynAmp;
          // v3.0: 整体亮度±5%缓慢脉动
          float glow = 1.0 + sin(uTime * 0.7) * 0.04;
          float alpha = vColor.a * edgeFade * flow * uActivity * glow;
          if (alpha < 0.0015) discard;
          gl_FragColor = vec4(vColor.rgb, alpha);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.material = mat;
    return mesh;
  }

  // ==================== 近距离喷发粒子（v3.0: 50粒+加速+横向扩散）====================
  _createCloseParticles(data) {
    const count = 50;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const group = new THREE.Group();
    group.visible = false;

    for (let i = 0; i < count; i++) {
      const theta = Math.PI * 0.5 + Math.random() * Math.PI * 0.5;
      const phi = Math.random() * Math.PI * 2;
      const r = data.nucleusRadius * 1.5 + Math.random() * data.comaRadius * 0.6;
      positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = r * Math.cos(theta);
      sizes[i] = data.nucleusRadius * (0.3 + Math.random() * 0.5);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    // 自定义 ShaderMaterial 支持逐粒子大小
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0.9, 0.8, 0.7) },
        uOpacity: { value: 0.45 },
      },
      vertexShader: `attribute float size; varying float vSize;
        void main() { vSize = size;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `precision highp float; varying float vSize;
        uniform vec3 uColor; uniform float uOpacity;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = (1.0 - d) * uOpacity;
          if (alpha < 0.02) discard;
          gl_FragColor = vec4(uColor, alpha); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    group.add(points);

    group.userData.particleData = {
      positions, sizes, count,
      comaRadius: data.comaRadius,
      nucleusRadius: data.nucleusRadius,
      speed: 0.45, // v3.0: 速度 0.15→0.45
    };
    return group;
  }

  // ==================== 开普勒方程 ====================
  _solveKepler(data, M) {
    let E = M;
    for (let i = 0; i < 6; i++) {
      const dE = (E - data.e * Math.sin(E) - M) / (1 - data.e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    const cosE = Math.cos(E), sinE = Math.sin(E);
    const theta = Math.atan2(Math.sqrt(1 - data.e * data.e) * sinE, cosE - data.e);
    const r = data.a * (1 - data.e * cosE);
    const trueAngle = theta + THREE.MathUtils.degToRad(data.ω);
    this._orbitPos.set(
      r * Math.cos(trueAngle),
      r * Math.sin(trueAngle) * Math.cos(THREE.MathUtils.degToRad(data.i)),
      r * Math.sin(trueAngle) * Math.sin(THREE.MathUtils.degToRad(data.i))
    );
  }

  _computeActivity(data, r) {
    const rP = data.perihelion;
    const rA = data.a * (1 + data.e);
    const act = 1.0 - THREE.MathUtils.smoothstep(rP * 1.5, rA * 0.7, r);
    return THREE.MathUtils.clamp(act, 0.05, 1.0);
  }

  // ==================== 每帧更新 ====================
  update(delta, elapsed) {
    for (const comet of this.comets) {
      const d = comet.data;
      const daysElapsed = elapsed * TIME_SCALE;
      const M = (comet.M0 + (daysElapsed / d.periodDays) * Math.PI * 2) % (Math.PI * 2);
      this._solveKepler(d, M);
      comet.group.position.copy(this._orbitPos);

      if (this._orbitPos.lengthSq() > 1e-6) {
        this._tailTo.copy(this._orbitPos).negate().normalize();
        this._tailQ.setFromUnitVectors(this._tailFrom, this._tailTo);
        comet.tailGroup.quaternion.copy(this._tailQ);
        comet.coma.quaternion.copy(this._tailQ);
      }

      const r = this._orbitPos.length();
      const activity = this._computeActivity(d, r);

      // 彗尾缩放 + uniform更新
      comet.tailGroup.scale.setScalar(0.08 + 0.92 * activity);
      for (const mesh of comet.tailMeshes) {
        const mat = mesh.userData?.material;
        if (mat?.uniforms) {
          mat.uniforms.uActivity.value = activity;
          mat.uniforms.uTime.value = elapsed;
        }
      }

      // 彗发
      const comaScale = 0.1 + 0.9 * activity;
      comet.coma.scale.set(comaScale, comaScale, comaScale * 1.35);
      if (comet.coma.userData?.material?.uniforms) {
        comet.coma.userData.material.uniforms.uActivity.value = activity;
        comet.coma.userData.material.uniforms.uTime.value = elapsed;
      }

      // LOD + 粒子
      if (this._camera) {
        comet.group.getWorldPosition(this._tmpWorld);
        const camDist = this._tmpWorld.distanceTo(this._camera.position);
        comet.group.visible = camDist < LOD_VERY_FAR;
        comet.coma.visible = camDist < LOD_FAR;
        comet.tailGroup.visible = camDist < LOD_FAR;
        const close = camDist < CLOSE_PARTICLE_DIST;
        comet.closeParticles.visible = close;
        if (close) this._updateCloseParticles(comet.closeParticles, delta, activity);
      }
    }
  }

  // ==================== 更新近距离粒子 ====================
  _updateCloseParticles(group, delta, activity) {
    const pd = group.userData.particleData;
    const pos = pd.positions;
    const sizes = pd.sizes;
    const maxR = pd.comaRadius * 0.9;
    const minR = pd.nucleusRadius * 1.5;

    for (let i = 0; i < pd.count; i++) {
      const idx = i * 3;
      // v3.0: 快速向尾漂移
      pos[idx + 2] += pd.speed * delta * activity;
      // v3.0: 横向扩散 — 越往尾部扩散越大
      const distFromNucleus = Math.max(0, pos[idx + 2]);
      const spread = distFromNucleus / maxR * 3.0;
      pos[idx] += Math.sin(pos[idx + 2] * 0.15 + i * 1.7) * spread * delta * 4.0;
      pos[idx + 1] += Math.cos(pos[idx + 2] * 0.12 + i * 2.3) * spread * delta * 4.0;
      // v3.0: 粒子越远越大
      sizes[i] = pd.nucleusRadius * (0.3 + distFromNucleus / maxR * 0.8);
      // 超出范围重置
      if (pos[idx + 2] > maxR * 0.5 || pos[idx + 2] < -maxR * 0.8) {
        const theta = Math.PI * 0.5 + Math.random() * Math.PI * 0.5;
        const phi = Math.random() * Math.PI * 2;
        const r = minR + Math.random() * (maxR * 0.4 - minR);
        pos[idx] = r * Math.sin(theta) * Math.cos(phi);
        pos[idx + 1] = r * Math.sin(theta) * Math.sin(phi);
        pos[idx + 2] = r * Math.cos(theta);
        sizes[i] = pd.nucleusRadius * 0.3;
      }
    }
    group.children[0].geometry.attributes.position.needsUpdate = true;
    group.children[0].geometry.attributes.size.needsUpdate = true;
    group.children[0].material.uniforms.uOpacity.value = 0.15 + activity * 0.4;
  }

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
