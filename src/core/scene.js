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
import { LensFlareSystem } from '../objects/lensFlare.js';
import { CometSystem } from '../objects/comets.js';
import { generateCelestialLayout } from '../utils/celestialLayout.js';
import { NearDust } from '../objects/nearDust.js';

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
      blackholes: [],      // v25: 支持多个黑洞
      pulsars: [],         // v25: 支持多个脉冲星
      solarSystem: null,
      particleFlow: null,
      lensFlare: null,
      comets: null,          // v27.6: 彗星系统
      nearDust: null,   // 近处微尘层
    };
    // 兼容旧代码的 blackhole/pulsar 引用（指向第一个实例）
    this._layout = null;
    this._sunWorldPos = new THREE.Vector3();
    this.initErrors = [];
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
    // v26: 银河与太阳系共面 — 倾斜统一由 galaxyCenterGroup 控制
    this.galaxyCenterGroup.rotation.x = THREE.MathUtils.degToRad(50);
    this.solarOrbitNode = new THREE.Group();     // 太阳系绕银心公转
    this.solarOrbitNode.position.x = config.galaxyMotion?.solarOrbitRadius || 50000;
    this.galaxyCenterGroup.add(this.solarOrbitNode);
    this.galaxyGroup.add(this.galaxyCenterGroup);
    this.scene.add(this.galaxyGroup);

    // ======== v25: 生成全局天体布局（基于时间种子，每次刷新不同） ========
    const solarWorldPos = new THREE.Vector3();
    this.solarOrbitNode.getWorldPosition(solarWorldPos);
    const galCenterWorldPos = new THREE.Vector3();
    this.galaxyCenterGroup.getWorldPosition(galCenterWorldPos);
    this._layout = generateCelestialLayout(galCenterWorldPos, solarWorldPos);

    // ======== 逐个初始化，失败不阻断整体流程 ========
    try {
      this.objects.stars = new StarField();
      this.objects.stars.init(this.galaxyGroup, this.galaxyCenterGroup);
    } catch (e) { this._recordInitError('星空', e); }

    try {
      this.objects.planets = new PlanetSystem();
      this.objects.planets.init(this.scene, this.galaxyCenterGroup);
      this.objects.planets.setCamera(camera);
      this.objects.planets.setSceneObjects(this.objects);
      // v25: 传入布局位置
      if (this._layout.planet.length) {
        this.objects.planets.setLayoutPositions(this._layout.planet);
      }
    } catch (e) { this._recordInitError('行星', e); }

    try {
      this.objects.nebula = new NebulaSystem();
      this.objects.nebula.init(this.galaxyCenterGroup, this._layout.nebula);
    } catch (e) { this._recordInitError('星云', e); }

    try {
      this.objects.speedLines = new SpeedLines();
      this.objects.speedLines.init(this.scene, camera);
    } catch (e) { this._recordInitError('速度线', e); }

    try {
      this.objects.cosmicDust = new CosmicDust();
      this.objects.cosmicDust.init(this.galaxyGroup);
      this.objects.cosmicDust.setCamera(camera);
    } catch (e) { this._recordInitError('宇宙尘埃', e); }

    // ======== 黑洞（v25: 支持多个，固定布局位置） ========
    try {
      for (const bhLayout of this._layout.blackhole) {
        const bh = new BlackHole();
        bh.init(this.scene, camera, this.objects.planets);
        bh.setLayoutPosition(bhLayout.position);
        bh._orbitPhase = bhLayout.orbitPhase;
        this.galaxyCenterGroup.add(bh.group);
        this.objects.blackholes.push(bh);
      }
    } catch (e) { this._recordInitError('黑洞', e); }

    // ======== 脉冲星（v25: 支持多个，固定布局位置） ========
    try {
      for (const psrLayout of this._layout.pulsar) {
        const psr = new Pulsar();
        psr.init(this.scene);
        psr.setCamera(camera);
        psr.setLayoutPosition(psrLayout.position);
        psr._orbitPhase = psrLayout.orbitPhase;
        this.galaxyCenterGroup.add(psr.group);
        this.objects.pulsars.push(psr);
      }
    } catch (e) { this._recordInitError('脉冲星', e); }

    try {
      this.objects.solarSystem = new SolarSystem();
      await this.objects.solarSystem.init(this.scene, camera);
      this.objects.solarSystem.setCamera(camera);
      // v10.0: 太阳系挂到solarOrbitNode下, 绕银心公转
      this.solarOrbitNode.add(this.objects.solarSystem.group);

      // v27.6: 彗星系统 — 挂在太阳系 group 下
      try {
        this.objects.comets = new CometSystem();
        this.objects.comets.init(this.objects.solarSystem.group);
        this.objects.comets.setCamera(camera);
      } catch (e) { this._recordInitError('彗星', e); }
    } catch (e) { this._recordInitError('太阳系', e); }

    try {
      this.objects.particleFlow = new ParticleFlow();
      this.objects.particleFlow.init(this.scene, camera);
    } catch (e) { this._recordInitError('粒子流', e); }

    // v13: 镜头光晕系统
    try {
      this.objects.lensFlare = new LensFlareSystem();
      this.objects.lensFlare.init(this.scene);
    } catch (e) { this._recordInitError('镜头光晕', e); }

    try {
      this.objects.nearDust = new NearDust();
      this.objects.nearDust.init(this.camera, this.scene);
    } catch (e) { this._recordInitError('近处微尘', e); }

    // v9.0: 微弱环境光 — 仅防暗部死黑，太阳是主光源
    this.ambientLight = new THREE.AmbientLight(0x111133, config.solarSystem.ambientIntensity || 0.05);
    this.scene.add(this.ambientLight);

    console.log('[SceneManager] v9.0 PBR场景初始化完成');
  }

  /**
   * 更新场景
   */
  update(delta, elapsed, speed = 0, velocity = null, maxSpeed = 80, sprintMultiplier = 3.0) {
    if (this.objects.stars) this.objects.stars.update(delta, elapsed);
    if (this.objects.planets) this.objects.planets.update(delta, elapsed);
    if (this.objects.nebula) this.objects.nebula.update(delta, elapsed, this.camera);
    if (this.objects.speedLines) this.objects.speedLines.update(delta, speed, velocity, maxSpeed, sprintMultiplier);
    if (this.objects.cosmicDust) this.objects.cosmicDust.update(delta, elapsed, velocity);
    // v25: 多黑洞和多脉冲星
    for (const bh of this.objects.blackholes) bh.update(delta, elapsed);
    for (const psr of this.objects.pulsars) psr.update(delta, elapsed);
    if (this.objects.solarSystem) this.objects.solarSystem.update(delta, elapsed);
    if (this.objects.comets) this.objects.comets.update(delta, elapsed);
    if (this.objects.particleFlow) this.objects.particleFlow.update(delta, elapsed, speed, velocity, maxSpeed, sprintMultiplier);

    // v-latest: 近处微尘参照物
    if (this.objects.nearDust) this.objects.nearDust.update(delta, velocity);

    // v13: 更新镜头光晕 (跟随太阳，复用临时向量避免GC)
    if (this.objects.lensFlare && this.objects.solarSystem?.sun) {
      this._sunWorldPos.set(0, 0, 0);
      this.objects.solarSystem.sun.getWorldPosition(this._sunWorldPos);
      this.objects.lensFlare.update(this.camera, this._sunWorldPos, 0.7, delta);
    }
  }

  /**
   * 通知场景当前是第一人称视角模式
   * @param {string} mode - 'close' | 'wide'
   */
  setViewMode(mode) {
    // nearDust 不依赖场景模式切换
  }

  _recordInitError(name, error) {
    this.initErrors.push({ name, error });
    console.warn(`[Scene] ${name}初始化失败:`, error);
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
    for (const bh of this.objects.blackholes) bh.dispose(this.scene);
    for (const psr of this.objects.pulsars) psr.dispose(this.scene);
    this.objects.blackholes = [];
    this.objects.pulsars = [];
    if (this.objects.solarSystem) this.objects.solarSystem.dispose(this.scene);
    if (this.objects.comets) this.objects.comets.dispose();
    if (this.objects.particleFlow) this.objects.particleFlow.dispose();

    if (this.objects.nearDust) this.objects.nearDust.dispose();

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
