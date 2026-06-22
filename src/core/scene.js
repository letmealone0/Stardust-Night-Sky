/**
 * 场景管理器
 * 管理 Three.js 场景和所有 3D 对象
 */

import * as THREE from 'three';
import { config } from './config.js';
import { StarField } from '../objects/stars.js';
import { PlanetSystem } from '../objects/planets.js';
import { NebulaSystem } from '../objects/nebula.js';

export class SceneManager {
  constructor() {
    this.scene = null;
    this.objects = {
      stars: null,
      planets: null,
      nebula: null,
    };
  }

  /**
   * 初始化场景
   */
  async init() {
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000005);
    this.scene.fog = new THREE.FogExp2(0x000005, 0.00015);

    // 创建星空
    this.objects.stars = new StarField();
    this.objects.stars.init(this.scene);

    // 创建行星
    this.objects.planets = new PlanetSystem();
    this.objects.planets.init(this.scene);

    // 创建星云
    this.objects.nebula = new NebulaSystem();
    this.objects.nebula.init(this.scene);

    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0x111122, 0.5);
    this.scene.add(ambientLight);

    // 添加点光源（模拟远处恒星）
    const pointLight = new THREE.PointLight(0xffeedd, 1, 2000);
    pointLight.position.set(100, 50, 100);
    this.scene.add(pointLight);

    console.log('[SceneManager] 场景初始化完成');
  }

  /**
   * 更新场景
   */
  update(delta, elapsed) {
    this.objects.stars.update(delta, elapsed);
    this.objects.planets.update(delta, elapsed);
    this.objects.nebula.update(delta, elapsed);
  }

  /**
   * 销毁场景
   */
  dispose() {
    this.objects.stars.dispose();
    this.objects.planets.dispose();
    this.objects.nebula.dispose();
  }
}
