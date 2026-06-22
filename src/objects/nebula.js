/**
 * 星云系统
 * 体积感星云效果
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange, randomVector3 } from '../utils/random.js';

export class NebulaSystem {
  constructor() {
    this.nebulae = [];
    this.group = new THREE.Group();
  }

  /**
   * 初始化星云系统
   */
  init(scene) {
    const { count, scale, opacity, colors } = config.nebula;

    for (let i = 0; i < count; i++) {
      const position = randomVector3(config.stars.spread * 0.4);
      const color = colors[i % colors.length];
      const nebula = this.createNebula(scale, position, color, opacity);
      this.group.add(nebula);
    }

    scene.add(this.group);
    console.log('[NebulaSystem] 星云系统初始化完成');
  }

  /**
   * 创建单个星云
   */
  createNebula(scale, position, color, opacity) {
    const group = new THREE.Group();
    group.position.copy(position);

    // 创建多个云团
    const cloudCount = 8 + Math.floor(Math.random() * 8);

    for (let i = 0; i < cloudCount; i++) {
      const cloud = this.createCloud(scale, color, opacity);
      cloud.position.set(
        randomRange(-scale * 0.3, scale * 0.3),
        randomRange(-scale * 0.2, scale * 0.2),
        randomRange(-scale * 0.3, scale * 0.3)
      );
      cloud.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      group.add(cloud);
    }

    group.userData = {
      rotationSpeed: randomRange(0.0001, 0.0005),
      pulseSpeed: randomRange(0.1, 0.3),
      pulsePhase: Math.random() * Math.PI * 2,
    };

    this.nebulae.push(group);
    return group;
  }

  /**
   * 创建单个云团
   */
  createCloud(scale, color, opacity) {
    // 使用自定义 Shader 创建体积感
    const geometry = new THREE.SphereGeometry(scale * 0.15, 16, 16);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color.r, color.g, color.b) },
        uOpacity: { value: opacity },
        uScale: { value: scale },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;
        
        uniform float uTime;
        uniform float uScale;
        
        // 简单噪声函数
        float noise(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          
          // 顶点动画
          vec3 pos = position;
          float n = noise(pos * 0.5 + uTime * 0.1);
          pos += normal * n * uScale * 0.02;
          
          vPosition = (modelViewMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;
        
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        
        void main() {
          // 边缘发光效果
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          
          // 中心更亮
          float center = 1.0 - length(vUv - 0.5) * 2.0;
          center = max(0.0, center);
          center = pow(center, 1.5);
          
          // 最终颜色
          vec3 finalColor = uColor * (intensity + center * 0.5);
          float finalOpacity = uOpacity * (intensity * 0.5 + center * 0.5);
          
          gl_FragColor = vec4(finalColor, finalOpacity);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * 更新星云系统
   */
  update(delta, elapsed) {
    this.nebulae.forEach((nebula) => {
      const data = nebula.userData;

      // 缓慢旋转
      nebula.rotation.y += data.rotationSpeed;

      // 脉冲效果
      const pulse = Math.sin(elapsed * data.pulseSpeed + data.pulsePhase) * 0.1 + 1.0;
      nebula.scale.setScalar(pulse);

      // 更新子云团的 Shader 时间
      nebula.children.forEach((cloud) => {
        if (cloud.material.uniforms) {
          cloud.material.uniforms.uTime.value = elapsed;
        }
      });
    });
  }

  /**
   * 销毁星云系统
   */
  dispose() {
    this.nebulae.forEach((nebula) => {
      nebula.children.forEach((cloud) => {
        cloud.geometry.dispose();
        cloud.material.dispose();
      });
    });
  }
}
