import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange, randomVector3 } from '../utils/random.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

/**
 * NebulaSystem - 体积光线步进星云 v11
 * 支持三类星云（发射/反射/暗星云）+ 湍流 + 飞入雾化
 */
export class NebulaSystem {
  constructor() {
    this.nebulae = [];
    this.group = new THREE.Group();
    this._tempVec = new THREE.Vector3();
    this._insideNebula = null; // v11
    this._hud = null;          // v11
  }

  init(scene) {
    const { count, scale, opacity } = config.nebula;
    const types = config.nebula.types || ['emission', 'reflection', 'dark'];
    const typeColors = config.nebula.typeColors;
    const spread = config.stars.spread * 0.4;

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.2 + Math.random() * 0.8);
      const position = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.3,
        r * Math.cos(phi)
      );
      // v11: 按类型选色
      const nebType = types[i % types.length];
      let color;
      if (typeColors && typeColors[nebType]) {
        color = typeColors[nebType];
      } else {
        const colors = config.nebula.colors;
        color = colors[i % colors.length];
      }
      const nebula = this.createNebula(scale, position, color, opacity, nebType);
      this.group.add(nebula);
    }

    scene.add(this.group);
    this._hud = window.engine?.hud || null;
    console.log('[NebulaSystem] v11 体积星云初始化完成');
  }

  createNebula(scale, position, color, opacity, nebType = 'emission') {
    const group = new THREE.Group();
    group.position.copy(position);

    const secondColor = this._pickSecondColor(color);
    const thirdColor = this._pickEdgeColor(color);  // v19.9: 边缘第三色
    const densityBase = randomRange(0.8, 1.5);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(color.r, color.g, color.b) },
        uColor2: { value: new THREE.Color(secondColor.r, secondColor.g, secondColor.b) },
        uColor3: { value: new THREE.Color(thirdColor.r, thirdColor.g, thirdColor.b) },
        uOpacity: { value: opacity },
        uScale: { value: scale },
        uDensity: { value: densityBase },
        uCameraLocalPos: { value: new THREE.Vector3(0, 0, 2000) },
        uSunDir: { value: new THREE.Vector3(1, 0.5, 0.3).normalize() },
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
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        uniform float uOpacity;
        uniform float uScale;
        uniform float uDensity;
        uniform vec3 uCameraLocalPos;
        uniform vec3 uSunDir;

        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        }

        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }

        // v19.9: 域扭曲 — 让输入坐标产生有机形变
        vec3 domainWarp(vec3 p) {
          vec3 q = p;
          q.x += noise(p + vec3(0.3, 0.0, 0.0)) * 0.7;
          q.y += noise(p + vec3(0.0, 0.3, 0.0)) * 0.7;
          q.z += noise(p + vec3(0.0, 0.0, 0.3)) * 0.7;
          return q;
        }

        // v19.9: 山脊噪声 — 产生纤细丝状结构
        float ridgeNoise(vec3 p) {
          float n = abs(noise(p));
          return pow(1.0 - n, 3.0);
        }

        float fbm(vec3 p) {
          float v = 0.0, a = 0.5;
          v += a * noise(p); p = p * 2.02 + vec3(100.0); a *= 0.5;
          v += a * noise(p); p = p * 2.03 + vec3(200.0); a *= 0.5;
          v += a * abs(noise(p) * 2.0 - 1.0);
          return v;
        }

        // v19.9: 重新设计的密度场 — 域扭曲 + 山脊 + 层状结构
        float density(vec3 p) {
          vec3 np = p / (uScale * 0.5);
          float r = length(np);
          float gradientFalloff = 1.0 - smoothstep(0.0, 1.0, r);
          gradientFalloff = pow(gradientFalloff, 1.5);
          if (gradientFalloff < 0.001) return 0.0;

          // 域扭曲坐标
          vec3 wp = domainWarp(np * 1.8 + uTime * 0.01);

          // 基础 FBM 云团
          float baseFbm = 0.0, amp = 0.5;
          vec3 q = wp;
          q += uTime * 0.015;
          baseFbm += amp * noise(q); q = q * 2.1 + 50.0; amp *= 0.5;
          baseFbm += amp * noise(q); q = q * 2.1 + 80.0; amp *= 0.5;
          baseFbm += amp * noise(q); q = q * 2.1 + 110.0; amp *= 0.5;

          // 山脊噪声层 — 丝状结构
          float ridge = ridgeNoise(wp * 2.5 + uTime * 0.005)
                      + ridgeNoise(wp * 1.5 - uTime * 0.003) * 0.5;

          // 湍流层（卷曲感）
          float turb = abs(noise(wp * 1.5 + uTime * 0.012) * 2.0 - 1.0);

          // 混合：云团为底，山脊叠加，湍流点缀
          float n = baseFbm * 0.55 + ridge * 0.3 + turb * 0.15;

          return n * gradientFalloff * uDensity;
        }

        vec2 boxHit(vec3 ro, vec3 rd, vec3 hs) {
          vec3 m = 1.0 / max(abs(rd), 1e-6) * sign(rd);
          vec3 n = m * ro;
          vec3 k = abs(m) * hs;
          vec3 t1 = -n - k, t2 = -n + k;
          float tN = max(max(t1.x, t1.y), t1.z);
          float tF = min(min(t2.x, t2.y), t2.z);
          if (tN > tF || tF < 0.0) return vec2(-1.0);
          return vec2(max(tN, 0.0), tF);
        }

        void main() {
          vec3 ro = uCameraLocalPos;
          vec3 toFrag = vLocalPos - uCameraLocalPos;
          vec3 rd = (dot(toFrag, toFrag) < 1e-10) ? vec3(0.0, 0.0, 1.0) : normalize(toFrag);

          vec3 halfSize = vec3(uScale * 0.5);
          vec2 t = boxHit(ro, rd, halfSize);
          if (t.x < 0.0) discard;

          float len = t.y - t.x;
          const int MAX_STEPS = 18;
          int steps = int(clamp(len / (uScale * 0.06), 4.0, float(MAX_STEPS)));
          float stepSize = len / float(steps);

          vec3 accColor = vec3(0.0);
          float accAlpha = 0.0;
          float tCur = t.x + stepSize * hash(ro + fract(uTime)) * 0.5;

          for (int i = 0; i < MAX_STEPS; i++) {
            if (i >= steps || accAlpha > 0.95) break;

            vec3 sp = ro + rd * tCur;
            float d = density(sp);

            if (d > 0.003) {
              float tc = d / uDensity;
              // v19.9: 三层渐变 — 稠密核心 → 中间色 → 稀薄边缘
              vec3 col = mix(uColor1, uColor2, smoothstep(0.15, 0.5, tc));
              col = mix(col, uColor3, smoothstep(0.45, 0.85, tc));

              float sunDot = max(0.0, dot(normalize(sp), uSunDir));
              float miePhase = 0.5 * (1.0 + sunDot * sunDot);
              col += uColor1 * miePhase * 0.2;

              float alpha = d * stepSize * 0.25 * uOpacity;
              accColor += col * alpha * (1.0 - accAlpha);
              accAlpha += alpha * (1.0 - accAlpha);
            }

            tCur += stepSize;
            if (tCur > t.y) break;
          }

          if (accAlpha < 0.002) discard;
          gl_FragColor = vec4(accColor, clamp(accAlpha, 0.0, 1.0));
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });

    const geometry = new THREE.BoxGeometry(scale, scale, scale);
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);

    group.userData = {
      rotationSpeed: randomRange(0.0005, 0.0015),   // v19.7: 可见的缓慢旋转
      pulseSpeed: randomRange(0.08, 0.18),           // 稍快呼吸
      pulsePhase: Math.random() * Math.PI * 2,
      driftDir: new THREE.Vector3(                   // v19.7: 缓慢漂移
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.3
      ).normalize(),
      material,
      nebType,
      scale,
    };

    this.nebulae.push(group);
    return group;
  }

  _pickSecondColor(c) {
    const shift = 0.15 + Math.random() * 0.2;
    return {
      r: Math.min(1, c.r + (c.r < 0.4 ? shift : -shift * 0.5)),
      g: Math.min(1, c.g + (c.g < 0.4 ? shift : -shift * 0.5)),
      b: Math.min(1, c.b + (c.b < 0.4 ? shift : -shift * 0.5)),
    };
  }

  /** v19.9: 生成边缘色 — 更暗更深，模拟星云外围 */
  _pickEdgeColor(c) {
    const edgeDarken = 0.3;
    return {
      r: c.r * edgeDarken + (c.r < 0.2 ? 0.05 : 0),
      g: c.g * edgeDarken + (c.g < 0.2 ? 0.03 : 0),
      b: c.b * (edgeDarken + 0.1), // 边缘偏蓝紫
    };
  }

  update(delta, elapsed, camera) {
    if (!camera) return;
    const cfg = config.nebula;
    const cm = config.celestialMotion;
    const motionScale = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;

    let closestNebula = null;
    let closestDist = Infinity;

    this.nebulae.forEach((nebula, index) => {
      const data = nebula.userData;
      const dist = nebula.position.distanceTo(camera.position);

      if (dist > cfg.respawnDistance) {
        this.respawnNebula(nebula, index, camera, cfg);
        return;
      }

      // v11: 检测是否在星云内
      const nebScale = data.scale || cfg.scale || 600;
      if (dist < nebScale * 0.5 && dist < closestDist) {
        closestDist = dist;
        closestNebula = nebula;
      }

      // v19.7: 缓慢旋转 + 呼吸脉冲 + 漂移
      nebula.rotation.y += data.rotationSpeed * motionScale;
      nebula.rotation.x += data.rotationSpeed * 0.3 * motionScale;
      const pulse = Math.sin(elapsed * data.pulseSpeed + data.pulsePhase) * 0.08 + 1.0;
      nebula.scale.setScalar(pulse);

      // 缓慢空间漂移
      if (data.driftDir) {
        nebula.position.addScaledVector(data.driftDir, 0.5 * delta * motionScale);
      }

      this._tempVec.copy(camera.position);
      nebula.worldToLocal(this._tempVec);
      data.material.uniforms.uCameraLocalPos.value.copy(this._tempVec);
      data.material.uniforms.uTime.value = elapsed;
    });

    // v11: 飞入星云信息显示
    if (closestNebula && closestNebula !== this._insideNebula) {
      this._insideNebula = closestNebula;
      if (this._hud) {
        const type = closestNebula.userData.nebType || '星云';
        const typeNames = { emission: '发射星云', reflection: '反射星云', dark: '暗星云' };
        this._hud.showMessage(`已进入 ${typeNames[type] || '星云'}`, 3000);
      }
    } else if (!closestNebula && this._insideNebula) {
      this._insideNebula = null;
    }
  }

  /**
   * v11: 更新后处理特效（星云雾化）
   */
  updatePostEffects(uniforms, camera) {
    const cfg = config.nebula;
    if (!camera) return;

    if (this._insideNebula) {
      const data = this._insideNebula.userData;
      const nebScale = data.scale || cfg.scale || 600;
      const dist = this._insideNebula.position.distanceTo(camera.position);
      const fogDist = cfg.fogDistance || 300;
      const maxDensity = cfg.fogDensity || 0.5;
      const density = (1 - dist / (nebScale * 0.5)) * maxDensity;
      uniforms.uFogDensity.value = Math.max(0, Math.min(maxDensity, density));

      // 根据星云类型设置雾色
      const type = data.nebType;
      if (type === 'emission') {
        uniforms.uFogColor.value.set(0.3, 0.1, 0.05);
      } else if (type === 'reflection') {
        uniforms.uFogColor.value.set(0.05, 0.1, 0.3);
      } else { // dark
        uniforms.uFogColor.value.set(0.02, 0.02, 0.05);
      }
    } else {
      uniforms.uFogDensity.value = 0;
    }
  }

  /**
   * v19.9: 重生星云 — 转换为世界坐标，正确处理galaxyGroup偏移
   */
  respawnNebula(nebula, index, camera, cfg) {
    const camPos = camera.position;

    const chunkX = Math.round(camPos.x / 2000);
    const chunkY = Math.round(camPos.y / 2000);
    const chunkZ = Math.round(camPos.z / 2000);
    const seed = hashCoords(chunkX + index * 7919, chunkY, chunkZ);
    const rng = seededRandom(seed);

    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = cfg.respawnMin + rng() * (cfg.respawnMax - cfg.respawnMin);

    const worldPos = new THREE.Vector3(
      camPos.x + r * Math.sin(phi) * Math.cos(theta),
      camPos.y + r * Math.sin(phi) * Math.sin(theta) * 0.3,
      camPos.z + r * Math.cos(phi)
    );

    if (nebula.parent) {
      const invMat = new THREE.Matrix4().copy(nebula.parent.matrixWorld).invert();
      worldPos.applyMatrix4(invMat);
    }
    nebula.position.copy(worldPos);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.nebulae.forEach((nebula) => {
      nebula.children.forEach((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    this.nebulae = [];
  }
}
