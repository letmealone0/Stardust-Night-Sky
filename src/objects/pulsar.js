/**
 * 脉冲星系统
 * 快速旋转的中子星 + 双锥光束
 */

import * as THREE from 'three';
import { config } from '../core/config.js';

export class Pulsar {
  constructor() {
    this.group = new THREE.Group();
    this.beams = [];
    this.rotationSpeed = 0;
    this.camera = null;
    this._hud = null;
    this._infoShown = false;
    this._flashDecay = 0;
    this._tmpCamDir = new THREE.Vector3();
    this._tmpBeamDir = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3(0, 1, 0);
  }

  setCamera(camera) {
    this.camera = camera;
  }
  setHUD(hud) { this._hud = hud; }

  init(scene) {
    const cfg = config.pulsar;
    // v25: 位置由 setLayoutPosition() 设置
    this.rotationSpeed = cfg.rotationSpeed;

    // 中子星本体：高亮球体
    const starGeo = new THREE.SphereGeometry(cfg.radius, 32, 32);
    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(cfg.color.r, cfg.color.g, cfg.color.b) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
          float core = pow(max(0.0, dot(viewDir, vNormal)), 3.0);
          float pulse = 0.7 + sin(uTime * 8.0) * 0.3;
          vec3 color = uColor * (core * 2.0 + rim * 0.5) * pulse;
          float alpha = min(1.0, core * 1.5 + rim * 0.3);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.userData.material = starMat;
    this.group.add(star);

    // 双锥光束
    for (let i = 0; i < 2; i++) {
      const direction = i === 0 ? 1 : -1;
      const beamGeo = new THREE.ConeGeometry(cfg.radius * 2, cfg.beamLength, 32, 1, true);
      const beamMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(cfg.color.r, cfg.color.g, cfg.color.b) },
          uDirection: { value: direction },
          uBeamHalfLen: { value: cfg.beamLength / 2 },
          uBeamRadius: { value: cfg.radius * 2 },
        },
        vertexShader: `
          varying vec3 vPosition;
          varying vec3 vNormal;
          void main() {
            vPosition = position;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPosition;
          varying vec3 vNormal;
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uDirection;
          uniform float uBeamHalfLen;
          uniform float uBeamRadius;
          void main() {
            // 沿光束方向的衰减
            float t = abs(vPosition.y) / uBeamHalfLen;
            float beam = 1.0 - t;
            beam = pow(max(0.0, beam), 2.0);

            // 径向衰减
            float radial = 1.0 - length(vPosition.xz) / uBeamRadius;
            radial = max(0.0, radial);

            // 脉冲
            float pulse = 0.6 + sin(uTime * 8.0 + t * 3.0) * 0.4;

            float intensity = beam * radial * pulse;
            vec3 color = uColor * intensity * 1.5;
            float alpha = intensity * 0.5;

            gl_FragColor = vec4(color, alpha);
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      });

      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = direction * (cfg.radius + cfg.beamLength / 2);
      beam.userData.material = beamMat;
      beam.userData.direction = direction;
      this.group.add(beam);
      this.beams.push(beam);
    }

    scene.add(this.group);
    this._infoShown = false;
    this._flashDecay = 0; // v11: 闪光衰减值
    console.log('[Pulsar] 脉冲星系统初始化完成');
  }

  update(delta, elapsed) {
    const cfg = config.pulsar;
    const cm = config.celestialMotion;
    const motionScale = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;

    // 自转 (v11: 受全局运动控制)
    this.group.rotation.y += this.rotationSpeed * delta * motionScale;

    // 更新所有 shader 的 uTime
    this.group.children.forEach((child) => {
      if (child.userData && child.userData.material && child.userData.material.uniforms) {
        child.userData.material.uniforms.uTime.value = elapsed;
      }
    });

    // v11: 靠近显示信息
    if (this.camera) {
      const dist = this.group.position.distanceTo(this.camera.position);
      const infoDist = cfg.infoDistance || 500;
      if (dist < infoDist) {
        this._showInfo(cfg, dist);
      } else if (this._infoShown) {
        if (this._hud) this._hud.hideCelestialInfo();
        this._infoShown = false;
      }
    }
  }

  /**
   * v11: 更新后处理特效（射束闪光 + 靠近噪点）
   */
  updatePostEffects(uniforms, camera, delta) {
    const cfg = config.pulsar;
    if (!camera || !this.group) return;

    const dist = this.group.position.distanceTo(camera.position);
    const time = performance.now() * 0.001;

    // 射束扫过检测：检查光束方向是否朝向相机
    this._tmpCamDir.subVectors(camera.position, this.group.position).normalize();
    const rotY = this.group.rotation.y;
    this._tmpBeamDir.set(0, 1, 0).applyAxisAngle(this._tmpUp, rotY);
    const dot1 = Math.abs(this._tmpCamDir.dot(this._tmpBeamDir));
    this._tmpBeamDir.set(0, -1, 0).applyAxisAngle(this._tmpUp, rotY);
    const dot2 = Math.abs(this._tmpCamDir.dot(this._tmpBeamDir));
    const maxDot = Math.max(dot1, dot2);

    // 闪光检测（射束接近相机方向时）
    const sweepThreshold = cfg.beamSweepAngle || 0.25;
    if (maxDot > sweepThreshold && dist < (cfg.beamLength || 300) * 3) {
      const flashStrength = ((maxDot - sweepThreshold) / (1 - sweepThreshold)) * (cfg.flashIntensity || 0.8);
      this._flashDecay = Math.max(this._flashDecay, flashStrength);
    }

    // 闪光衰减
    if (this._flashDecay > 0.001) {
      this._flashDecay *= Math.exp(-(cfg.flashDecay || 4.0) * delta);
      if (this._flashDecay < 0.001) this._flashDecay = 0;
    }
    uniforms.uFlashIntensity.value = this._flashDecay;

    // 靠近噪点
    const noiseRange = cfg.noiseDistance || 400;
    if (dist < noiseRange) {
      const noiseStrength = (1 - dist / noiseRange) * (cfg.maxNoiseIntensity || 0.5);
      uniforms.uNoiseIntensity.value = noiseStrength;
    } else {
      uniforms.uNoiseIntensity.value = 0;
    }
  }

  _showInfo(cfg, dist) {
    if (!this._hud) return;
    this._infoShown = true;
    const period = (2 * Math.PI / cfg.rotationSpeed).toFixed(2);
    const details = [
      `中子星半径: ${cfg.radius} AU`,
      `光束长度: ${cfg.beamLength} AU`,
      `自转周期: ${period}s`,
      `距离: ${dist.toFixed(0)} AU`,
    ].join('<br>');
    this._hud.showCelestialInfo('脉冲星', 'Neutron Star — Pulsar', details);
  }

  /** v25: 设置布局位置（不再使用 respawn） */
  setLayoutPosition(pos) {
    this.group.position.copy(pos);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.beams = [];
  }
}
