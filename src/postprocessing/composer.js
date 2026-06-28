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

    // OutputPass 必须在最后：负责 toneMapping 和 sRGB 转换
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    console.log('[PostProcessingManager] 后处理初始化完成（Bloom + OutputPass）');
  }

  render() {
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
  }
}
