/**
 * 后处理效果管理器
 * 管理辉光、暗角等后处理效果
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { config } from '../core/config.js';

export class PostProcessingManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloomPass = null;
    this.vignettePass = null;
  }

  /**
   * 初始化后处理
   */
  init() {
    // 创建效果合成器
    this.composer = new EffectComposer(this.renderer);

    // 渲染通道
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 辉光效果
    const { strength, radius, threshold } = config.postprocessing.bloom;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      strength,
      radius,
      threshold
    );
    this.composer.addPass(this.bloomPass);

    // 暗角效果
    this.vignettePass = this.createVignettePass();
    this.composer.addPass(this.vignettePass);

    // 输出通道
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    console.log('[PostProcessingManager] 后处理初始化完成');
  }

  /**
   * 创建暗角效果
   */
  createVignettePass() {
    const { offset, darkness } = config.postprocessing.vignette;

    const vignetteShader = {
      uniforms: {
        tDiffuse: { value: null },
        uOffset: { value: offset },
        uDarkness: { value: darkness },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uOffset;
        uniform float uDarkness;
        varying vec2 vUv;
        
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          
          // 计算暗角
          vec2 center = vUv - 0.5;
          float dist = length(center);
          float vignette = smoothstep(0.8, uOffset * 0.5, dist * (uDarkness + uOffset));
          
          // 应用暗角
          color.rgb *= vignette;
          
          // 添加轻微色差
          float chromatic = 0.002;
          vec4 colorR = texture2D(tDiffuse, vUv + vec2(chromatic, 0.0));
          vec4 colorB = texture2D(tDiffuse, vUv - vec2(chromatic, 0.0));
          color.r = colorR.r;
          color.b = colorB.b;
          
          gl_FragColor = color;
        }
      `,
    };

    return new ShaderPass(vignetteShader);
  }

  /**
   * 渲染后处理
   */
  render() {
    this.composer.render();
  }

  /**
   * 窗口大小变化
   */
  onResize() {
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  }

  /**
   * 销毁后处理
   */
  dispose() {
    this.composer.dispose();
  }
}
