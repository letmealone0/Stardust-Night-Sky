import * as THREE from 'three';
import { randomRange } from '../utils/random.js';
import { config } from '../core/config.js';

/**
 * CosmicDust v11 — 三层结构 + 旋臂分布 + 湍流 + 速度线划过
 */
export class CosmicDust {
  constructor() {
    this.layers = [];      // v11: [{ points, geometry, material, positions, initialPositions, phaseOffsets, layerCfg }]
    this.camera = null;
    this._centerPos = new THREE.Vector3();
    this._dustColor = new THREE.Color();
  }

  setCamera(camera) {
    this.camera = camera;
    if (camera) this._centerPos.copy(camera.position);
  }

  init(scene) {
    const cfg = config.cosmicDust;
    const layers = cfg.layers || [{ count: cfg.count, spread: cfg.spread, opacity: 0.15, speed: 1.0 }];

    layers.forEach((layerCfg) => {
      const { count, spread, opacity } = layerCfg;
      const positions = new Float32Array(count * 3);
      const initialPositions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const phaseOffsets = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let x, y, z;

        if (cfg.armDistribution) {
          // v11: 沿旋臂分布（对数螺旋 + 高斯散布）
          const armCount = config.stars?.galaxy?.armCount || 5;
          const arm = i % armCount;
          const armAngle = (arm / armCount) * Math.PI * 2;
          const dist = spread * (0.2 + Math.random() * 0.8);
          const spin = config.stars?.galaxy?.spin || 2.5;
          const theta = armAngle + Math.log(1 + dist / spread) * spin;
          const spreadFactor = cfg.armSpread || 0.25;
          const jitter = (Math.random() - 0.5) * spread * spreadFactor;
          x = dist * Math.cos(theta) + jitter;
          z = dist * Math.sin(theta) + jitter;
          y = (Math.random() - 0.5) * spread * 0.15;
        } else {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = spread * (0.2 + Math.random() * 0.8);
          x = r * Math.sin(phi) * Math.cos(theta);
          y = r * Math.sin(phi) * Math.sin(theta);
          z = r * Math.cos(phi);
        }

        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;
        initialPositions[i3] = x;
        initialPositions[i3 + 1] = y;
        initialPositions[i3 + 2] = z;

        const brightness = 0.1 + Math.random() * 0.2;
        const warmth = Math.random() > 0.5 ? 0.1 : 0.6;
        const color = new THREE.Color().setHSL(warmth, 0.3, brightness);
        colors[i3] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;

        sizes[i] = randomRange(0.5, 2.0);
        phaseOffsets[i] = i * 0.1;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uBaseOpacity: { value: opacity || 0.15 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          uVelocityStretch: { value: 0.0 },
          uVelDir: { value: new THREE.Vector3(0, 0, -1) },
          uBaseSize: { value: 1.5 },
        },
        vertexShader: `
          attribute float size;
          uniform float uBaseOpacity;
          uniform float uPixelRatio;
          uniform float uVelocityStretch;
          uniform vec3 uVelDir;
          uniform float uBaseSize;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float depth = -mvPosition.z;
            // 深度雾：远处更淡
            float depthFade = clamp(depth / 6000.0, 0.0, 1.0);
            vAlpha = uBaseOpacity * (1.0 - depthFade * 0.6);
            // 远处粒子更大但更淡
            float sizeScale = 1.0 + depthFade * 0.4;
            // 速度拉伸
            if (uVelocityStretch > 0.01) {
              vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
              vec3 toCamera = normalize(cameraPosition - worldPos);
              float stretch = abs(dot(toCamera, uVelDir)) * uVelocityStretch;
              sizeScale *= (1.0 + stretch * 2.0);
            }
            gl_PointSize = size * uBaseSize * uPixelRatio * sizeScale * (300.0 / depth);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float alpha = 1.0 - smoothstep(0.2, 1.0, d);
            if (alpha < 0.01 || vAlpha < 0.005) discard;
            gl_FragColor = vec4(vColor, alpha * vAlpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      this.layers.push({ points, geometry, material, positions, initialPositions, phaseOffsets, layerCfg });
    });

    console.log('[CosmicDust] v11 三层宇宙尘埃初始化完成，总粒子:', this.layers.reduce((s, l) => s + l.layerCfg.count, 0));
  }

  update(delta, elapsed, velocity) {
    const cfg = config.cosmicDust;
    const cm = config.celestialMotion;
    const motionScale = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;

    // 移动速度
    let speed = 0, vx = 0, vy = 0, vz = 0;
    if (velocity && velocity.lengthSq() > 0.01) {
      speed = velocity.length();
      vx = velocity.x / speed; vy = velocity.y / speed; vz = velocity.z / speed;
    }
    const speedFactor = Math.min(speed / 50, 1.0);

    // 重居中检测
    if (this.camera) {
      const dist = this.camera.position.distanceTo(this._centerPos);
      if (dist > cfg.recenterDistance) {
        this._recenterAll(cfg);
      }
    }

    // 更新每层
    this.layers.forEach((layer) => {
      const lcfg = layer.layerCfg;
      const pos = layer.geometry.attributes.position.array;
      const init = layer.initialPositions;
      const phases = layer.phaseOffsets;
      const layerSpeed = (lcfg.speed || 1.0) * motionScale;
      const turbulence = (cfg.turbulenceStrength || 0.5) * layerSpeed;

      const et1 = elapsed * 0.01 * layerSpeed;
      const et2 = elapsed * 0.008 * layerSpeed;
      const et3 = elapsed * 0.006 * layerSpeed;

      for (let i = 0, i3 = 0; i < pos.length / 3; i++, i3 += 3) {
        const p = phases[i];
        const drift = 0.5 + Math.sin(et1 * 0.5 + p * 0.1) * 0.5;
        const drift10 = drift * 10 * turbulence;

        let px = init[i3]     + Math.sin(et1 + p) * drift10;
        let py = init[i3 + 1] + Math.cos(et2 + p * 1.5) * drift10;
        let pz = init[i3 + 2] + Math.sin(et3 + p * 2) * drift10;

        // 移动推开效果
        if (speedFactor > 0.01 && this.camera) {
          const dx = px - this.camera.position.x;
          const dy = py - this.camera.position.y;
          const dz = pz - this.camera.position.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          const pushRadius = 200;
          if (distSq < pushRadius * pushRadius) {
            const dist = Math.sqrt(distSq);
            const push = (1 - dist / pushRadius) * speedFactor * 45;
            px += vx * push; py += vy * push; pz += vz * push;
          }
        }

        pos[i3] = px; pos[i3 + 1] = py; pos[i3 + 2] = pz;
      }
      layer.geometry.attributes.position.needsUpdate = true;

      // 脉冲透明度 + 速度拉伸
      const baseOpacity = (lcfg.opacity || 0.15) + Math.sin(elapsed * 0.02) * 0.04;
      layer.material.uniforms.uBaseOpacity.value = baseOpacity + speedFactor * 0.15;
      layer.material.uniforms.uVelocityStretch.value = speedFactor * (cfg.speedLineStretch || 3.0);
      if (velocity && speed > 0.01) {
        layer.material.uniforms.uVelDir.value.copy(velocity).normalize();
      }
      const blueTint = 0.7 + speedFactor * 0.3;
      this._dustColor.setRGB(blueTint * 0.9, blueTint, 1.0);
      layer.material.color = this._dustColor;
    });
  }

  _recenterAll(cfg) {
    if (!this.camera) return;
    const camPos = this.camera.position;
    this._centerPos.copy(camPos);

    this.layers.forEach((layer) => {
      const lcfg = layer.layerCfg;
      const spread = lcfg.spread || cfg.spread;
      const pos = layer.positions;
      const init = layer.initialPositions;
      const count = pos.length / 3;

      for (let i = 0, i3 = 0; i < count; i++, i3 += 3) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = spread * (0.2 + Math.random() * 0.8);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        init[i3] = camPos.x + x;
        init[i3 + 1] = camPos.y + y;
        init[i3 + 2] = camPos.z + z;
        pos[i3] = init[i3]; pos[i3 + 1] = init[i3 + 1]; pos[i3 + 2] = init[i3 + 2];
      }
    });
  }

  dispose(scene) {
    this.layers.forEach((layer) => {
      if (layer.points) scene.remove(layer.points);
      if (layer.geometry) layer.geometry.dispose();
      if (layer.material) layer.material.dispose();
    });
    this.layers = [];
  }
}
