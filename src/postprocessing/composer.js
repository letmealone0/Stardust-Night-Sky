import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { config } from '../core/config.js';

/** v11: 统一后处理特效 Shader（引力透镜 + 脉冲噪点 + 闪光 + 星云雾化） */
const CelestialEffectsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    // 引力透镜
    uLensCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uLensStrength: { value: 0 },
    uLensRadius: { value: 0.25 },
    // 脉冲星噪点
    uNoiseIntensity: { value: 0 },
    // 闪光
    uFlashIntensity: { value: 0 },
    // 星云雾化
    uFogDensity: { value: 0 },
    uFogColor: { value: new THREE.Vector3(0.05, 0.08, 0.15) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    // 引力透镜
    uniform vec2 uLensCenter;
    uniform float uLensStrength;
    uniform float uLensRadius;
    // 噪点
    uniform float uNoiseIntensity;
    // 闪光
    uniform float uFlashIntensity;
    // 雾化
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    varying vec2 vUv;

    // 伪随机
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // 1. 引力透镜扭曲
      if (uLensStrength > 0.001) {
        vec2 toCenter = uv - uLensCenter;
        float dist = length(toCenter);
        if (dist < uLensRadius) {
          float falloff = 1.0 - dist / uLensRadius;
          float distort = uLensStrength * falloff * falloff;
          // 径向扭曲 + 轻微切向扭曲（模拟引力透镜弧线）
          vec2 radial = normalize(toCenter) * distort * 0.08;
          vec2 tangential = vec2(-toCenter.y, toCenter.x) * distort * 0.03;
          uv = uv - radial - tangential;
          uv = clamp(uv, 0.0, 1.0);
        }
      }

      vec4 color = texture2D(tDiffuse, uv);

      // 2. 脉冲星噪点干扰
      if (uNoiseIntensity > 0.001) {
        float noise = rand(vUv * uTime * 100.0) * 2.0 - 1.0;
        float n = noise * uNoiseIntensity;
        // 扫描线效果
        float scanline = sin(vUv.y * 800.0 + uTime * 20.0) * 0.5 + 0.5;
        n += scanline * uNoiseIntensity * 0.15;
        color.rgb += vec3(n * 0.5, n * 0.6, n * 0.8);
      }

      // 3. 脉冲星闪光
      if (uFlashIntensity > 0.001) {
        color.rgb += vec3(0.8, 0.9, 1.0) * uFlashIntensity;
      }

      // 4. 星云雾化
      if (uFogDensity > 0.001) {
        // 边缘更浓的雾化
        vec2 center = vec2(0.5);
        float edgeDist = length(vUv - center) * 1.4;
        float fog = uFogDensity * (0.5 + edgeDist * 0.5);
        color.rgb = mix(color.rgb, uFogColor, clamp(fog, 0.0, 0.7));
        // 轻微降低对比度
        color.rgb = mix(color.rgb, vec3(dot(color.rgb, vec3(0.333))), fog * 0.3);
      }

      gl_FragColor = color;
    }
  `,
};

export class PostProcessingManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloomPass = null;
    this.celestialPass = null;
  }

  init() {
    // 防御重复初始化：若已存在 composer 先释放，避免 pass 叠加
    if (this.composer) {
      this.dispose();
      this.composer = null;
      this.bloomPass = null;
    }

    const { width, height } = this.renderer.domElement;
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const { strength, radius, threshold } = config.postprocessing.bloom;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      strength,
      radius,
      threshold
    );
    this.composer.addPass(this.bloomPass);

    // v11: 天体效果 Pass（引力透镜 + 噪点 + 闪光 + 雾化）
    this.celestialPass = new ShaderPass(CelestialEffectsShader);
    this.composer.addPass(this.celestialPass);

    // OutputPass 必须在最后：负责 toneMapping 和 sRGB 转换
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    console.log('[PostProcessingManager] v11 后处理初始化完成（Bloom + CelestialEffects + OutputPass）');
  }

  /** 获取天体效果 pass 引用（供外部系统设置 uniform） */
  getCelestialPass() {
    return this.celestialPass;
  }

  render() {
    // 更新时间 uniform
    if (this.celestialPass) {
      this.celestialPass.uniforms.uTime.value = performance.now() * 0.001;
    }
    if (this.composer) this.composer.render();
  }

  onResize() {
    if (!this.composer) return;
    const { width, height } = this.renderer.domElement;
    this.composer.setSize(width, height);
  }

  dispose() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.bloomPass = null;
    this.celestialPass = null;
  }
}
