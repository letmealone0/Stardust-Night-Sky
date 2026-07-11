/**
 * 恒星日冕 Billboard (v13 Space Engine风格)
 * 朝向摄像机的多层日冕着色器，支持颜色温度映射
 */

import * as THREE from 'three';

// 恒星光谱颜色映射 (O→B→A→F→G→K→M)
const SPECTRAL_COLORS = {
  O: new THREE.Color(0.6, 0.7, 1.0),
  B: new THREE.Color(0.7, 0.8, 1.0),
  A: new THREE.Color(0.9, 0.92, 1.0),
  F: new THREE.Color(1.0, 0.97, 0.9),
  G: new THREE.Color(1.0, 0.9, 0.7),
  K: new THREE.Color(1.0, 0.72, 0.42),
  M: new THREE.Color(1.0, 0.52, 0.32),
};

export function getStarColor(temperature) {
  if (temperature > 30000) return SPECTRAL_COLORS.O.clone();
  if (temperature > 10000) return SPECTRAL_COLORS.B.clone();
  if (temperature > 7500) return SPECTRAL_COLORS.A.clone();
  if (temperature > 6000) return SPECTRAL_COLORS.F.clone();
  if (temperature > 5200) return SPECTRAL_COLORS.G.clone();
  if (temperature > 3700) return SPECTRAL_COLORS.K.clone();
  return SPECTRAL_COLORS.M.clone();
}

export function getStarColorByType(type) {
  const t = type?.toUpperCase();
  return SPECTRAL_COLORS[t] || SPECTRAL_COLORS.G;
}

const starGlowVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starGlowFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uStarColor;
  uniform float uTime;
  uniform float uIntensity;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);

    // 1. 极亮核心（白热）
    float core = exp(-dist * dist * 180.0) * 2.2;

    // 2. 内冕（暖色，带微扰）
    float inner = exp(-dist * dist * 22.0) * 0.85;
    float innerNoise = hash(center * 12.0 + uTime * 0.8) * 0.15;

    // 3. 外冕（冷色，扩散）
    float outer = exp(-dist * dist * 5.5) * 0.35;
    float outerPulse = 0.8 + sin(uTime * 1.2) * 0.2;

    // 4. 动态射线（6条主射线 + hash随机小射线）
    float angle = atan(center.y, center.x);
    float rays = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = angle * 6.0 + float(i) * 1.047 + uTime * 0.4;
      rays += pow(abs(sin(a)), 18.0) * exp(-dist * 9.0) * 0.18;
    }
    rays += hash(vec2(angle * 12.0, dist * 8.0)) * exp(-dist * 6.0) * 0.12;

    // 合成颜色：白热核心 → 暖色内冕 → 冷蓝外晕
    vec3 coreColor = vec3(1.0, 0.98, 0.92);
    vec3 innerColor = uStarColor * 1.2;
    vec3 outerColor = mix(uStarColor, vec3(0.6, 0.8, 1.0), 0.6);

    vec3 color = coreColor * core
               + innerColor * (inner + innerNoise)
               + outerColor * outer * outerPulse
               + vec3(0.8, 0.9, 1.0) * rays;

    float alpha = core + inner * 1.1 + outer * 0.8 + rays * 0.6;

    gl_FragColor = vec4(color * uIntensity, alpha * uIntensity * 0.95);
  }
`;

export class StarGlow {
  constructor(radius, color, intensity = 1.0) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 6, radius * 6),
      new THREE.ShaderMaterial({
        uniforms: {
          uStarColor: { value: color instanceof THREE.Color ? color : new THREE.Color(color) },
          uTime: { value: 0 },
          uIntensity: { value: intensity },
        },
        vertexShader: starGlowVertexShader,
        fragmentShader: starGlowFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.userData.isStarGlow = true;
  }

  update(elapsed) {
    this.mesh.material.uniforms.uTime.value = elapsed;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
