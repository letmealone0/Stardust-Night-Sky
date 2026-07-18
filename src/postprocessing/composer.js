import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { config } from '../core/config.js';

/** v25: 统一后处理特效 Shader（引力透镜 + 脉冲噪点 + 闪光 + 星云雾化 + 运动模糊 + 自动曝光 + 色彩分级） */
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
    // v13: 运动模糊
    uMotionBlurIntensity: { value: 0 },
    uMotionDir: { value: new THREE.Vector2(0, 0) },
    // v13: 镜头效果
    uChromaticAberration: { value: 0 },
    uVignetteStrength: { value: 0.3 },
    // v13: 色调映射增强
    uContrast: { value: 1.0 },
    uSaturation: { value: 1.0 },
    // v25: 自动曝光
    uExposure: { value: 1.0 },
    uExposureTarget: { value: 1.0 },
    uPrevLuminance: { value: 0.5 },
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
    uniform vec2 uLensCenter;
    uniform float uLensStrength;
    uniform float uLensRadius;
    uniform float uNoiseIntensity;
    uniform float uFlashIntensity;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    uniform float uMotionBlurIntensity;
    uniform vec2 uMotionDir;
    uniform float uChromaticAberration;
    uniform float uVignetteStrength;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uExposure;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // v25: ACES 电影色调映射
    vec3 acesFilm(vec3 x) {
      float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    // v25: 颜色分级（暖色天体、冷色深空）
    vec3 colorGrade(vec3 color) {
      float warmth = dot(color, vec3(0.4, 0.3, 0.3));
      vec3 coolShift = vec3(0.94, 0.97, 1.06);
      vec3 warmShift = vec3(1.04, 1.01, 0.94);
      color = mix(color * coolShift, color * warmShift, smoothstep(0.1, 0.6, warmth));
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(vec3(lum), color, 1.06);
    }

    void main() {
      vec2 uv = vUv;

      // v19.5: 无任何特效时直接输出
      if (uMotionBlurIntensity < 0.005 && uLensStrength < 0.001 && uNoiseIntensity < 0.001
          && uFlashIntensity < 0.001 && uFogDensity < 0.001 && uChromaticAberration < 0.001) {
        vec4 col = texture2D(tDiffuse, vUv);
        // v25: 自动曝光 + 色彩分级始终应用
        col.rgb = colorGrade(col.rgb);
        gl_FragColor = vec4(acesFilm(col.rgb * uExposure), col.a);
        return;
      }

      // 1. 引力透镜扭曲
      if (uLensStrength > 0.001) {
        vec2 toCenter = uv - uLensCenter;
        float dist = length(toCenter);
        if (dist < uLensRadius) {
          float falloff = 1.0 - dist / uLensRadius;
          float distort = uLensStrength * falloff * falloff;
          vec2 radial = normalize(toCenter) * distort * 0.08;
          vec2 tangential = vec2(-toCenter.y, toCenter.x) * distort * 0.03;
          uv = uv - radial - tangential;
          uv = clamp(uv, 0.0, 1.0);
        }
      }

      // 2. 运动模糊（3 次采样，减少纹理采样开销）
      vec4 color = vec4(0.0);
      if (uMotionBlurIntensity > 0.005) {
        vec2 vel = uMotionDir * uMotionBlurIntensity * 0.5;
        color = texture2D(tDiffuse, uv);
        color += texture2D(tDiffuse, clamp(uv + vel, 0.0, 1.0));
        color += texture2D(tDiffuse, clamp(uv - vel, 0.0, 1.0));
        color /= 3.0;
      } else {
        color = texture2D(tDiffuse, uv);
      }

      // 3. 色差
      if (uChromaticAberration > 0.001) {
        vec2 caDir = (vUv - vec2(0.5)) * uChromaticAberration;
        color.r = texture2D(tDiffuse, clamp(uv + caDir, 0.0, 1.0)).r;
        color.b = texture2D(tDiffuse, clamp(uv - caDir, 0.0, 1.0)).b;
      }

      // 4. 脉冲星噪点
      if (uNoiseIntensity > 0.001) {
        float noise = rand(vUv * uTime * 100.0) * 2.0 - 1.0;
        float n = noise * uNoiseIntensity;
        float scanline = sin(vUv.y * 800.0 + uTime * 20.0) * 0.5 + 0.5;
        n += scanline * uNoiseIntensity * 0.15;
        color.rgb += vec3(n * 0.5, n * 0.6, n * 0.8);
      }

      // 5. 脉冲星闪光（v25: 添加 RGB 色散偏移）
      if (uFlashIntensity > 0.001) {
        float caOffset = uFlashIntensity * 0.02;
        color.r += uFlashIntensity * 0.9;
        color.g += uFlashIntensity * 0.92;
        color.b += uFlashIntensity;
        // 轻微 RGB 偏移模拟光学衍射
        color.r = texture2D(tDiffuse, clamp(uv + vec2(caOffset, 0.0), 0.0, 1.0)).r * uFlashIntensity + color.r * 0.3;
        color.b = texture2D(tDiffuse, clamp(uv - vec2(caOffset, 0.0), 0.0, 1.0)).b * uFlashIntensity + color.b * 0.3;
      }

      // 6. 星云雾化
      if (uFogDensity > 0.001) {
        vec2 center = vec2(0.5);
        float edgeDist = length(vUv - center) * 1.4;
        float fog = uFogDensity * (0.5 + edgeDist * 0.5);
        color.rgb = mix(color.rgb, uFogColor, clamp(fog, 0.0, 0.4));
        color.rgb = mix(color.rgb, vec3(dot(color.rgb, vec3(0.333))), fog * 0.3);
      }

      // 7. 暗角
      float vignette = 1.0 - smoothstep(0.3, 0.95, length(vUv - vec2(0.5)) * 1.3);
      color.rgb *= mix(1.0, vignette, uVignetteStrength);

      // 8. 对比度 + 饱和度
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(gray), color.rgb, uSaturation);
      color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

      // v25: 颜色分级（冷暖对比）
      color.rgb = colorGrade(color.rgb);

      // v14: 边缘保护
      float edgeFade = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x)
                     * smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
      color.rgb *= edgeFade;

      // v25: ACES 色调映射 + 自动曝光
      color.rgb = acesFilm(color.rgb * uExposure);

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
    this.dofPass = null;
    this._prevCamPos = new THREE.Vector3();
    this._tempVel = new THREE.Vector3();
    this._tempViewDir = new THREE.Vector3();
    this._tempRight = new THREE.Vector3();
    this._tempUp = new THREE.Vector3();
    this._initialized = false;
    // v25: 自动曝光系统
    this._currentExposure = 1.0;
    this._exposureTarget = 1.0;
  }

  init() {
    if (this.composer) {
      this.dispose();
      this.composer = null;
      this.bloomPass = null;
    }

    const { width, height } = this.renderer.domElement;
    this.composer = new EffectComposer(this.renderer);

    // Pass 1: 场景渲染
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Pass 2: Bloom (v23: 半分辨率渲染，性能+40%)
    const { strength, radius, threshold } = config.postprocessing.bloom;
    const bloomW = Math.floor(width / 2);
    const bloomH = Math.floor(height / 2);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      strength,
      radius,
      threshold
    );
    this.composer.addPass(this.bloomPass);

    // Pass 3: 天体效果 + 运动模糊 + 镜头效果 + 色调增强
    this.celestialPass = new ShaderPass(CelestialEffectsShader);
    this.composer.addPass(this.celestialPass);

    // 设置默认色调参数
    const rCfg = config.renderer;
    this.celestialPass.uniforms.uContrast.value = rCfg.contrast || 1.0;
    this.celestialPass.uniforms.uSaturation.value = rCfg.saturation || 1.0;
    this.celestialPass.uniforms.uVignetteStrength.value = config.postprocessing.vignette?.darkness || 0.3;

    // Pass 4: Output (toneMapping + sRGB)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    this._initialized = true;
    console.log('[PostProcessingManager] v13 后处理初始化完成（Bloom + CelestialEffects + OutputPass）');
  }

  getCelestialPass() {
    return this.celestialPass;
  }

  /** v25: 自动曝光更新 — 根据场景亮度动态调整曝光值 */
  updateExposure(delta) {
    if (!this.celestialPass) return;
    const u = this.celestialPass.uniforms;

    // 目标曝光：雾密则暗 → 提曝；闪亮则亮 → 降曝
    const fogFactor = u.uFogDensity.value;
    const flashFactor = u.uFlashIntensity.value;

    // 画面偏亮时降低曝光（防止过曝），偏暗时提高曝光
    // 基线 brightness=1.0 → exposure=1.0，避免默认曝光漂到 2.0
    const brightness = 1.0 + flashFactor * 1.5 - fogFactor * 0.4;
    this._exposureTarget = 1.0 / Math.max(0.3, brightness);

    // 平滑过渡（模拟人眼适应，约1.5秒达到目标）
    const adaptSpeed = 1.5;
    this._currentExposure += (this._exposureTarget - this._currentExposure) * Math.min(1, delta * adaptSpeed);
    u.uExposure.value = this._currentExposure;
  }

  /** v13: 更新运动模糊参数（v23: 复用临时变量避免GC） */
  updateMotionBlur(camera, delta) {
    if (!this.celestialPass || !camera) return;
    const mbCfg = config.postprocessing.motionBlur;
    if (!mbCfg?.enabled) return;

    const velocity = this._tempVel.subVectors(camera.position, this._prevCamPos);
    const speed = velocity.length();

    if (speed < 0.5) {
      this.celestialPass.uniforms.uMotionBlurIntensity.value = 0;
    } else if (speed > (mbCfg.speedThreshold || 2.0)) {
      const viewDir = this._tempViewDir.copy(camera.getWorldDirection(this._tempViewDir));
      const right = this._tempRight.crossVectors(viewDir, camera.up).normalize();
      const up = this._tempUp.crossVectors(right, viewDir).normalize();
      const screenVelX = velocity.dot(right);
      const screenVelY = velocity.dot(up);
      const len = Math.sqrt(screenVelX * screenVelX + screenVelY * screenVelY);
      if (len > 0.01) {
        this.celestialPass.uniforms.uMotionDir.value.set(screenVelX / len, screenVelY / len);
        this.celestialPass.uniforms.uMotionBlurIntensity.value =
          Math.min(speed / 200, 0.25) * (mbCfg.intensity || 0.4);
      }
    } else {
      this.celestialPass.uniforms.uMotionBlurIntensity.value *= 0.7;
      if (this.celestialPass.uniforms.uMotionBlurIntensity.value < 0.005) {
        this.celestialPass.uniforms.uMotionBlurIntensity.value = 0;
      }
    }

    this._prevCamPos.copy(camera.position);
  }

  render(delta = 0.016) {
    if (this.celestialPass) {
      this.celestialPass.uniforms.uTime.value = performance.now() * 0.001;
      // v25: 自动曝光
      this.updateExposure(delta);
      // v23: 智能开关 — 所有特效强度为0时禁用pass
      const u = this.celestialPass.uniforms;
      // v25: 自动曝光/色彩分级始终启用（不再完全禁用pass）
      const hasEffects = u.uMotionBlurIntensity.value > 0.005 || u.uLensStrength.value > 0.001
        || u.uNoiseIntensity.value > 0.001 || u.uFlashIntensity.value > 0.001
        || u.uFogDensity.value > 0.001 || u.uChromaticAberration.value > 0.001;
      // 始终启用以应用曝光+色彩分级
      this.celestialPass.enabled = true;
      // 但当完全无效果时标记低开销
      if (!hasEffects && u.uExposure.value > 0.99 && u.uExposure.value < 1.01) {
        // 无事可做，保持启用但会快速通过（ACES + 色彩分级仍会执行）
      }
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
    this.dofPass = null;
  }
}
