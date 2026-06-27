/**
 * 场景管理器
 * 管理 Three.js 场景和所有 3D 对象
 */

import * as THREE from 'three';
import { config } from './config.js';
import { StarField } from '../objects/stars.js';
import { PlanetSystem } from '../objects/planets.js';
import { NebulaSystem } from '../objects/nebula.js';
import { SpeedLines } from '../objects/speedlines.js';
import { CosmicDust } from '../objects/cosmicdust.js';
import { BlackHole } from '../objects/blackhole.js';
import { Pulsar } from '../objects/pulsar.js';
import { SolarSystem } from '../objects/solarSystem.js';
import { ParticleFlow } from '../objects/particleFlow.js';

export class SceneManager {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.objects = {
      stars: null,
      planets: null,
      nebula: null,
      speedLines: null,
      cosmicDust: null,
      blackhole: null,
      pulsar: null,
      solarSystem: null,
      particleFlow: null,
    };
  }

  /**
   * 初始化场景
   */
  async init(camera) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000005);
    // v8.2: 线性雾 — 扩展范围匹配超大银河
    this.scene.fog = new THREE.Fog(0x000005, 6000, 100000);

    // 逐个初始化，失败不阻断整体流程
    try {
      this.objects.stars = new StarField();
      this.objects.stars.init(this.scene);
    } catch (e) { console.warn('[Scene] 星空初始化失败:', e); }

    try {
      this.objects.planets = new PlanetSystem();
      this.objects.planets.init(this.scene);
      this.objects.planets.setCamera(camera);
      this.objects.planets.setSceneObjects(this.objects);
    } catch (e) { console.warn('[Scene] 行星初始化失败:', e); }

    try {
      this.objects.nebula = new NebulaSystem();
      this.objects.nebula.init(this.scene);
    } catch (e) { console.warn('[Scene] 星云初始化失败:', e); }

    try {
      this.objects.speedLines = new SpeedLines();
      this.objects.speedLines.init(this.scene, camera);
    } catch (e) { console.warn('[Scene] 速度线初始化失败:', e); }

    try {
      this.objects.cosmicDust = new CosmicDust();
      this.objects.cosmicDust.init(this.scene);
      this.objects.cosmicDust.setCamera(camera);
    } catch (e) { console.warn('[Scene] 宇宙尘埃初始化失败:', e); }

    try {
      this.objects.blackhole = new BlackHole();
      this.objects.blackhole.init(this.scene, camera, this.objects.planets);
    } catch (e) { console.warn('[Scene] 黑洞初始化失败:', e); }

    try {
      this.objects.pulsar = new Pulsar();
      this.objects.pulsar.init(this.scene);
      this.objects.pulsar.setCamera(camera);
    } catch (e) { console.warn('[Scene] 脉冲星初始化失败:', e); }

    try {
      this.objects.solarSystem = new SolarSystem();
      await this.objects.solarSystem.init(this.scene, camera);
      this.objects.solarSystem.setCamera(camera);
    } catch (e) { console.warn('[Scene] 太阳系初始化失败:', e); }

    try {
      this.objects.particleFlow = new ParticleFlow();
      this.objects.particleFlow.init(this.scene, camera);
    } catch (e) { console.warn('[Scene] 粒子流初始化失败:', e); }

    // v9.0: 微弱环境光 — 仅防暗部死黑，太阳是主光源
    const ambientLight = new THREE.AmbientLight(0x111133, config.solarSystem.ambientIntensity || 0.05);
    this.scene.add(ambientLight);

    console.log('[SceneManager] v9.0 PBR场景初始化完成');
  }

  /**
   * 更新场景
   */
  update(delta, elapsed, speed = 0, velocity = null) {
    if (this.objects.stars) this.objects.stars.update(delta, elapsed);
    if (this.objects.planets) this.objects.planets.update(delta, elapsed);
    if (this.objects.nebula) this.objects.nebula.update(delta, elapsed, this.camera);
    if (this.objects.speedLines) this.objects.speedLines.update(delta, speed, velocity);
    if (this.objects.cosmicDust) this.objects.cosmicDust.update(delta, elapsed, velocity);
    if (this.objects.blackhole) this.objects.blackhole.update(delta, elapsed);
    if (this.objects.pulsar) this.objects.pulsar.update(delta, elapsed);
    if (this.objects.solarSystem) this.objects.solarSystem.update(delta, elapsed);
    if (this.objects.particleFlow) this.objects.particleFlow.update(delta, elapsed, speed, velocity);
  }

  /**
   * 销毁场景
   */
  dispose() {
    if (this.objects.stars) this.objects.stars.dispose(this.scene);
    if (this.objects.planets) this.objects.planets.dispose(this.scene);
    if (this.objects.nebula) this.objects.nebula.dispose(this.scene);
    if (this.objects.speedLines) this.objects.speedLines.dispose();
    if (this.objects.cosmicDust) this.objects.cosmicDust.dispose(this.scene);
    if (this.objects.blackhole) this.objects.blackhole.dispose(this.scene);
    if (this.objects.pulsar) this.objects.pulsar.dispose(this.scene);
    if (this.objects.solarSystem) this.objects.solarSystem.dispose(this.scene);
    if (this.objects.particleFlow) this.objects.particleFlow.dispose();
  }
}
