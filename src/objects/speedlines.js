/**
 * 速度线系统
 * 作为相机子对象，自动跟随视角旋转
 */

import * as THREE from 'three';

export class SpeedLines {
  constructor() {
    this.group = new THREE.Group();
    this.particleCount = 150;
    this.geometry = null;
    this.material = null;
    this.points = null;
    this.positions = null;
    this.speed = 0;
    this.camera = null;
  }

  /**
   * 初始化速度线 - 添加到相机
   */
  init(scene, camera) {
    this.camera = camera;
    
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.3,
      color: 0x88aaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    
    // 作为相机子对象，自动跟随相机旋转
    this.camera.add(this.points);
    
    console.log('[SpeedLines] 速度线系统初始化完成');
  }

  /**
   * 重置粒子 - 在相机局部坐标系前方
   */
  resetParticle(i) {
    const i3 = i * 3;
    
    // 圆柱形分布在相机前方（局部坐标系：-Z 是前方）
    const angle = Math.random() * Math.PI * 2;
    const radius = 2 + Math.random() * 15;
    const z = -(20 + Math.random() * 80); // 前方 20-100 单位
    
    this.positions[i3] = Math.cos(angle) * radius;
    this.positions[i3 + 1] = Math.sin(angle) * radius;
    this.positions[i3 + 2] = z;
  }

  /**
   * 更新速度线
   */
  update(delta, speed) {
    this.speed = speed;
    
    // 根据速度调整透明度
    const targetOpacity = speed > 3 ? Math.min(speed / 15, 0.8) : 0;
    this.material.opacity += (targetOpacity - this.material.opacity) * 0.15;
    
    // 根据速度调整大小
    this.material.size = 0.3 + speed * 0.02;
    
    if (speed < 2) {
      return;
    }
    
    // 移动粒子（向相机靠近，模拟飞行）
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      
      // 向相机方向移动（Z 正方向）
      this.positions[i3 + 2] += speed * delta * 8;
      
      // 如果飞过相机（Z > 5），重置到前方
      if (this.positions[i3 + 2] > 5) {
        this.resetParticle(i);
      }
    }
    
    this.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * 销毁速度线
   */
  dispose() {
    this.camera.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
