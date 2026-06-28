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
import { disposeAllPlanetTextures } from '../objects/planetTextures.js';

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
    this.scene.fog = new THREE.Fog(0x000005, 10000, 120000);

    // v10.0: 三级Group嵌套 — 银河自转+太阳系公转
    this.galaxyGroup = new THREE.Group();        // 银河整体自转
    this.galaxyCenterGroup = new THREE.Group();  // 银心位置
    this.galaxyCenterGroup.position.set(-15000, 500, -30000);
    this.solarOrbitNode = new THREE.Group();     // 太阳系绕银心公转
    this.solarOrbitNode.position.x = config.galaxyMotion?.solarOrbitRadius || 50000;
    this.galaxyCenterGroup.add(this.solarOrbitNode);
    this.galaxyGroup.add(this.galaxyCenterGroup);
    this.scene.add(this.galaxyGroup);

    // 逐个初始化，失败不阻断整体流程
    try {
      this.objects.stars = new StarField();
      this.objects.stars.init(this.galaxyGroup);  // v10.0: 挂到galaxyGroup
    } catch (e) { console.warn('[Scene] 星空初始化失败:', e); }

    try {
      this.objects.planets = new PlanetSystem();
      this.objects.planets.init(this.scene);
      this.objects.planets.setCamera(camera);
      this.objects.planets.setSceneObjects(this.objects);
      // v11: 挂到 galaxyGroup 随银河较差自转
      if (this.objects.planets.group) {
        this.scene.remove(this.objects.planets.group);
        this.galaxyGroup.add(this.objects.planets.group);
      }
    } catch (e) { console.warn('[Scene] 行星初始化失败:', e); }

    try {
      this.objects.nebula = new NebulaSystem();
      this.objects.nebula.init(this.galaxyGroup);  // v10.0: 星云挂到galaxyGroup
    } catch (e) { console.warn('[Scene] 星云初始化失败:', e); }

    try {
      this.objects.speedLines = new SpeedLines();
      this.objects.speedLines.init(this.scene, camera);
    } catch (e) { console.warn('[Scene] 速度线初始化失败:', e); }

    try {
      this.objects.cosmicDust = new CosmicDust();
      this.objects.cosmicDust.init(this.galaxyGroup);  // v10.0: 尘埃挂到galaxyGroup
      this.objects.cosmicDust.setCamera(camera);
    } catch (e) { console.warn('[Scene] 宇宙尘埃初始化失败:', e); }

    try {
      this.objects.blackhole = new BlackHole();
      this.objects.blackhole.init(this.scene, camera, this.objects.planets);
      // v11: 挂到 galaxyGroup 随银河较差自转
      if (this.objects.blackhole.group) {
        this.scene.remove(this.objects.blackhole.group);
        this.galaxyGroup.add(this.objects.blackhole.group);
      }
    } catch (e) { console.warn('[Scene] 黑洞初始化失败:', e); }

    try {
      this.objects.pulsar = new Pulsar();
      this.objects.pulsar.init(this.scene);
      this.objects.pulsar.setCamera(camera);
      // v11: 挂到 galaxyGroup 随银河较差自转
      if (this.objects.pulsar.group) {
        this.scene.remove(this.objects.pulsar.group);
        this.galaxyGroup.add(this.objects.pulsar.group);
      }
    } catch (e) { console.warn('[Scene] 脉冲星初始化失败:', e); }

    try {
      this.objects.solarSystem = new SolarSystem();
      await this.objects.solarSystem.init(this.scene, camera);
      this.objects.solarSystem.setCamera(camera);
      // v10.0: 太阳系挂到solarOrbitNode下, 绕银心公转
      this.solarOrbitNode.add(this.objects.solarSystem.group);
    } catch (e) { console.warn('[Scene] 太阳系初始化失败:', e); }

    try {
      this.objects.particleFlow = new ParticleFlow();
      this.objects.particleFlow.init(this.scene, camera);
    } catch (e) { console.warn('[Scene] 粒子流初始化失败:', e); }

    // v9.0: 微弱环境光 — 仅防暗部死黑，太阳是主光源
    this.ambientLight = new THREE.AmbientLight(0x111133, config.solarSystem.ambientIntensity || 0.05);
    this.scene.add(this.ambientLight);

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
    // 销毁各子系统（释放 GPU 资源）
    if (this.objects.stars) this.objects.stars.dispose(this.scene);
    if (this.objects.planets) this.objects.planets.dispose(this.scene);
    if (this.objects.nebula) this.objects.nebula.dispose(this.scene);
    if (this.objects.speedLines) this.objects.speedLines.dispose();
    if (this.objects.cosmicDust) this.objects.cosmicDust.dispose(this.scene);
    if (this.objects.blackhole) this.objects.blackhole.dispose(this.scene);
    if (this.objects.pulsar) this.objects.pulsar.dispose(this.scene);
    if (this.objects.solarSystem) this.objects.solarSystem.dispose(this.scene);
    if (this.objects.particleFlow) this.objects.particleFlow.dispose();

    // 清理场景级资源：环境光、雾、背景、银河三级 Group
    if (this.ambientLight && this.scene) {
      this.scene.remove(this.ambientLight);
      this.ambientLight = null;
    }
    if (this.galaxyGroup && this.scene) {
      this.scene.remove(this.galaxyGroup);
      this.galaxyGroup = null;
    }
    if (this.scene) {
      this.scene.fog = null;
      this.scene.background = null;
      this.scene.clear();
    }
    // 释放共享的行星纹理缓存
    disposeAllPlanetTextures();
  }
}
