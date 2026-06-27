import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange, randomVector3 } from '../utils/random.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

/**
 * NebulaSystem - 体积光线步进星云
 */
export class NebulaSystem {
  constructor() {
    this.nebulae = [];
    this.group = new THREE.Group();
    this._tempVec = new THREE.Vector3();
  }

  init(scene) {
    const { count, scale, opacity, colors } = config.nebula;
    const spread = config.stars.spread * 0.4; // 星云分布范围

    for (let i = 0; i < count; i++) {
      // 所有星云随机分布在球壳内
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = spread * (0.2 + Math.random() * 0.8);
      const position = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.3,
        r * Math.cos(phi)
      );
      const color = colors[i % colors.length];
      const nebula = this.createNebula(scale, position, color, opacity);
      this.group.add(nebula);
    }

    scene.add(this.group);
    console.log('[NebulaSystem] 体积星云初始化完成');
  }

  createNebula(scale, position, color, opacity) {
    const group = new THREE.Group();
    group.position.copy(position);

    const secondColor = this._pickSecondColor(color);
    const densityBase = randomRange(0.6, 1.2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(color.r, color.g, color.b) },
        uColor2: { value: new THREE.Color(secondColor.r, secondColor.g, secondColor.b) },
        uOpacity: { value: opacity },
        uScale: { value: scale },
        uDensity: { value: densityBase },
        uCameraLocalPos: { value: new THREE.Vector3(0, 0, 2000) },
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
        uniform float uOpacity;
        uniform float uScale;
        uniform float uDensity;
        uniform vec3 uCameraLocalPos;

        // ---- 轻量噪声（2 次乘法 hash） ----
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

        // 2 层 FBM + 1 层 turbulence，平衡性能和细节
        float fbm(vec3 p) {
          float v = 0.0, a = 0.5;
          v += a * noise(p); p = p * 2.02 + vec3(100.0); a *= 0.5;
          v += a * noise(p); p = p * 2.03 + vec3(200.0); a *= 0.5;
          v += a * abs(noise(p) * 2.0 - 1.0);  // turbulence 层，增加丝絮感
          return v;
        }

        // v8.2: 改进密度场 — 更多细节+更柔和球形衰减
        float density(vec3 p) {
          vec3 np = p / (uScale * 0.5);
          float r = length(np);
          float falloff = 1.0 - smoothstep(0.3, 1.0, r);
          if (falloff < 0.001) return 0.0;

          // 3层FBM + 湍流
          float n = 0.0, amp = 0.5;
          vec3 q = np * 1.5 + uTime * 0.01;
          n += amp * noise(q); q = q * 2.1 + 50.0; amp *= 0.5;
          n += amp * noise(q); q = q * 2.1 + 80.0; amp *= 0.5;
          n += amp * noise(q); q = q * 2.1 + 110.0; amp *= 0.5;
          n += amp * abs(noise(q * 1.5 + uTime * 0.006) * 2.0 - 1.0);

          float filaments = abs(noise(np * 3.5 + uTime * 0.005) * 2.0 - 1.0);
          n = mix(n, filaments, 0.35);
          return n * falloff * uDensity;
        }

        // 光线-盒子相交
        vec2 boxHit(vec3 ro, vec3 rd, vec3 hs) {
          vec3 m = 1.0 / rd;
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
          vec3 rd = normalize(vLocalPos - uCameraLocalPos);

          vec3 halfSize = vec3(uScale * 0.5);
          vec2 t = boxHit(ro, rd, halfSize);
          if (t.x < 0.0) discard;

          float len = t.y - t.x;
          const int MAX_STEPS = 28;
          int steps = int(clamp(len / (uScale * 0.05), 5.0, float(MAX_STEPS)));
          float stepSize = len / float(steps);

          vec3 accColor = vec3(0.0);
          float accAlpha = 0.0;
          float tCur = t.x + stepSize * hash(ro + fract(uTime)) * 0.5;

          // 第三色：亮白高光（密度最高处）
          vec3 uColor3 = mix(uColor1, vec3(1.0, 0.95, 0.9), 0.3);

          for (int i = 0; i < MAX_STEPS; i++) {
            if (i >= steps || accAlpha > 0.95) break;

            vec3 sp = ro + rd * tCur;
            float d = density(sp);

            if (d > 0.003) {
              float tc = d / uDensity;
              vec3 col = mix(uColor1, uColor2, smoothstep(0.1, 0.55, tc));
              col = mix(col, uColor3, smoothstep(0.5, 0.85, tc) * 0.4);

              float alpha = d * stepSize * 0.18 * uOpacity;
              accColor += col * alpha * (1.0 - accAlpha);
              accAlpha += alpha * (1.0 - accAlpha);
            }

            tCur += stepSize;
            if (tCur > t.y) break;
          }

          if (accAlpha < 0.002) discard;
          gl_FragColor = vec4(accColor, accAlpha * 0.7);
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
      rotationSpeed: randomRange(0.0001, 0.0003),
      pulseSpeed: randomRange(0.05, 0.12),
      pulsePhase: Math.random() * Math.PI * 2,
      material,
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

  update(delta, elapsed, camera) {
    if (!camera) return;
    const cfg = config.nebula;

    this.nebulae.forEach((nebula, index) => {
      const data = nebula.userData;

      // 星云重生：离相机太远时在新位置重生
      const dist = nebula.position.distanceTo(camera.position);
      if (dist > cfg.respawnDistance) {
        this.respawnNebula(nebula, index, camera, cfg);
        return;
      }

      nebula.rotation.y += data.rotationSpeed;

      const pulse = Math.sin(elapsed * data.pulseSpeed + data.pulsePhase) * 0.05 + 1.0;
      nebula.scale.setScalar(pulse);

      // 复用 _tempVec，零 GC
      this._tempVec.copy(camera.position);
      nebula.worldToLocal(this._tempVec);
      data.material.uniforms.uCameraLocalPos.value.copy(this._tempVec);
      data.material.uniforms.uTime.value = elapsed;
    });
  }

  /**
   * 重生星云到相机附近的新位置
   */
  respawnNebula(nebula, index, camera, cfg) {
    const camPos = camera.position;

    const chunkX = Math.round(camPos.x / 1500);
    const chunkY = Math.round(camPos.y / 1500);
    const chunkZ = Math.round(camPos.z / 1500);
    const seed = hashCoords(chunkX + index * 7919, chunkY, chunkZ);
    const rng = seededRandom(seed);

    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = cfg.respawnMin + rng() * (cfg.respawnMax - cfg.respawnMin);

    nebula.position.set(
      camPos.x + r * Math.sin(phi) * Math.cos(theta),
      camPos.y + r * Math.sin(phi) * Math.sin(theta) * 0.3,
      camPos.z + r * Math.cos(phi)
    );
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
