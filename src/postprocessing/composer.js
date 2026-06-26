import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { config } from '../core/config.js';

export class PostProcessingManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloomPass = null;
  }

  init() {
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

    // OutputPass 必须在最后：负责 toneMapping 和 sRGB 转换
    // 缺少 OutputPass 是之前黑白闪烁的根本原因
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // toneMapping 已在 RendererManager 中统一设置为 ACESFilmicToneMapping

    console.log('[PostProcessingManager] 后处理初始化完成（EffectComposer + Bloom + OutputPass）');
  }

  render() {
    this.composer.render();
  }

  onResize() {
    const { width, height } = this.renderer.domElement;
    this.composer.setSize(width, height);
  }

  dispose() {
    this.composer.dispose();
  }
}
