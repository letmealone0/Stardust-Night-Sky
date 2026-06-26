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
  }

  init(scene) {
    const cfg = config.pulsar;
    this.group.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
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
          void main() {
            // 沿光束方向的衰减
            float t = abs(vPosition.y) / 75.0;
            float beam = 1.0 - t;
            beam = pow(max(0.0, beam), 2.0);

            // 径向衰减
            float radial = 1.0 - length(vPosition.xz) / 6.0;
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
    console.log('[Pulsar] 脉冲星系统初始化完成');
  }

  update(delta, elapsed) {
    // 自转
    this.group.rotation.y += this.rotationSpeed * delta;

    // 更新所有 shader 的 uTime
    this.group.children.forEach((child) => {
      if (child.userData && child.userData.material && child.userData.material.uniforms) {
        child.userData.material.uniforms.uTime.value = elapsed;
      }
    });
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
