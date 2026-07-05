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

  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);

    // 内核 (亮白)
    float core = exp(-dist * dist * 120.0) * 1.5;

    // 内冕 (恒星颜色)
    float innerCorona = exp(-dist * dist * 18.0) * 0.6;

    // 外冕 (带脉动)
    float pulse = 0.85 + sin(uTime * 0.8) * 0.15;
    float outerCorona = exp(-dist * dist * 4.0) * 0.35 * pulse;

    // 射线 (spikes)
    float angle = atan(center.y, center.x);
    float rays = pow(abs(sin(angle * 5.0 + uTime * 0.3)), 12.0) * exp(-dist * 6.0) * 0.25;
    rays += pow(abs(sin(angle * 3.0 - uTime * 0.2)), 16.0) * exp(-dist * 8.0) * 0.15;

    // 外层柔和光晕
    float outerGlow = exp(-dist * dist * 1.5) * 0.12;

    vec3 coreColor = mix(vec3(1.0), uStarColor, 0.3);
    vec3 color = coreColor * core + uStarColor * (innerCorona + outerCorona + rays + outerGlow);
    float alpha = core + innerCorona + outerCorona + rays + outerGlow;

    gl_FragColor = vec4(color * uIntensity, alpha * uIntensity);
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
