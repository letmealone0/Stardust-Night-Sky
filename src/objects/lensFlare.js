/**
 * 恒星镜头光晕 (v13 Space Engine风格)
 * Sprite序列: 六边形光晕 + 十字光芒 + 圆形光斑
 * 当恒星靠近屏幕中心时激活
 */

import * as THREE from 'three';

function createFlareTexture(type, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;

  if (type === 'halo') {
    // 主光晕 - 径向渐变
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
    g.addColorStop(0, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.15, 'rgba(255,245,230,0.8)');
    g.addColorStop(0.4, 'rgba(200,220,255,0.3)');
    g.addColorStop(0.7, 'rgba(150,180,255,0.08)');
    g.addColorStop(1.0, 'rgba(100,140,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else if (type === 'streak') {
    // 十字光芒
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(200,220,255,0.2)');
    g.addColorStop(1.0, 'rgba(150,180,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // 水平条纹
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(0, cy - 2, 0, cy + 2);
    lg.addColorStop(0, 'rgba(255,255,255,0.0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    lg.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, cy - 4, size, 8);
    // 垂直条纹
    const vg = ctx.createLinearGradient(cx - 2, 0, cx + 2, 0);
    vg.addColorStop(0, 'rgba(255,255,255,0.0)');
    vg.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    vg.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = vg;
    ctx.fillRect(cx - 4, 0, 8, size);
  } else if (type === 'dot') {
    // 小圆形光斑 (用于沿光轴分布)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.8);
    g.addColorStop(0, 'rgba(180,200,255,0.7)');
    g.addColorStop(0.5, 'rgba(150,180,255,0.2)');
    g.addColorStop(1.0, 'rgba(100,140,255,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'hex') {
    // 六边形光晕
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const x = cx + Math.cos(a) * cx * 0.7;
      const y = cy + Math.sin(a) * cy * 0.7;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.7);
    g.addColorStop(0, 'rgba(200,220,255,0.4)');
    g.addColorStop(0.6, 'rgba(150,180,255,0.15)');
    g.addColorStop(1.0, 'rgba(100,140,255,0.0)');
    ctx.fillStyle = g;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class LensFlareSystem {
  constructor() {
    this.group = new THREE.Group();
    this.flares = [];
    this.active = false;
    this._textures = {};
    this._tempVec = new THREE.Vector3();
    this._flareDir = new THREE.Vector3();
    this._camToStar = new THREE.Vector3();
  }

  init(scene) {
    // 创建光晕纹理
    this._textures.halo = createFlareTexture('halo');
    this._textures.streak = createFlareTexture('streak');
    this._textures.hex = createFlareTexture('hex');
    this._textures.dot = createFlareTexture('dot');

    // 主光晕
    this._addSprite(this._textures.halo, 1.0, 4.0);
    // 十字光芒
    this._addSprite(this._textures.streak, 0.7, 5.0);
    // 六边形
    this._addSprite(this._textures.hex, 0.4, 2.5);

    // 沿光轴的光斑（使用世界空间偏移因子）
    const dotOffsets = [0.3, 0.5, 0.7, -0.3, -0.5];
    const dotSizes = [0.6, 0.8, 0.5, 0.4, 0.3];
    dotOffsets.forEach((offset, i) => {
      const sprite = this._addSprite(this._textures.dot, 0.3, dotSizes[i]);
      sprite.userData.offsetFactor = offset;
      sprite.userData.isDot = true;
    });

    scene.add(this.group);
    this.group.visible = false;
  }

  _addSprite(texture, opacity, scale) {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(scale, scale, 1);
    sprite.userData.baseOpacity = opacity;
    sprite.userData.baseScale = scale;
    sprite.renderOrder = 999;
    this.group.add(sprite);
    this.flares.push(sprite);
    return sprite;
  }

  /**
   * v2: 使用世界空间方向向量沿光轴分布光斑
   * 修复：原版使用NDC坐标×固定系数，恒星偏离屏幕中心时方向/大小完全错误
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} starWorldPos - 恒星世界坐标
   * @param {number} brightness - 恒星亮度 (0~1)
   * @param {number} delta
   */
  update(camera, starWorldPos, brightness, delta) {
    if (!camera || !starWorldPos) return;

    // 将恒星位置投影到屏幕
    const pos = this._tempVec.copy(starWorldPos).project(camera);
    const screenX = pos.x;
    const screenY = pos.y;
    const screenDist = Math.sqrt(screenX * screenX + screenY * screenY);

    // 恒星在视野内且不在太边缘
    const inView = pos.z > 0 && pos.z < 1 && screenDist < 1.5;

    if (!inView) {
      this._fade(delta);
      return;
    }

    // 亮度随到屏幕中心距离衰减 (中心最亮)
    const centerFade = 1.0 - Math.min(1.0, screenDist / 1.2);
    const targetOpacity = centerFade * brightness * 0.8;

    if (targetOpacity < 0.05) {
      this._fade(delta);
      return;
    }

    this.group.visible = true;
    const fadeSpeed = 4.0 * delta;

    // v2: 计算相机到恒星的世界空间方向向量，光斑沿此方向分布
    this._flareDir.subVectors(starWorldPos, camera.position).normalize();
    const starDist = camera.position.distanceTo(starWorldPos);

    this.flares.forEach(sprite => {
      const target = targetOpacity * sprite.userData.baseOpacity;
      sprite.material.opacity += (target - sprite.material.opacity) * fadeSpeed;

      if (sprite.userData.isDot) {
        // v2: 光斑沿世界空间光轴（相机→恒星方向）分布
        const offset = sprite.userData.offsetFactor;
        const distAlong = offset * starDist * 0.3;
        sprite.position.copy(
          this._flareDir.clone().multiplyScalar(distAlong)
        );
      } else {
        sprite.position.set(0, 0, 0);
      }
    });

    // 整体位置跟随恒星
    this.group.position.copy(starWorldPos);
  }

  _fade(delta) {
    const fadeSpeed = 3.0 * delta;
    let anyVisible = false;
    this.flares.forEach(sprite => {
      sprite.material.opacity *= (1 - fadeSpeed);
      if (sprite.material.opacity > 0.01) anyVisible = true;
    });
    if (!anyVisible) this.group.visible = false;
  }

  dispose() {
    this.flares.forEach(sprite => {
      sprite.material.dispose();
    });
    Object.values(this._textures).forEach(t => t.dispose());
    this.group.clear();
  }
}
