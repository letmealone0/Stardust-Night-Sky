/**
 * NebulaSystem v20 — 多层粒子星云
 *
 * 设计参考：深空天文摄影中的发射星云
 * - 三层 Points 粒子系统（外层弥散气体 / 中层粉紫云体 / 内层亮核+暗尘）
 * - 3D 噪声驱动不规则外形、内部空洞和纤维结构
 * - AdditiveBlending + depthWrite:false
 * - 缓慢湍流旋转 + 非刚体内部运动
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';

// ---- GLSL 噪声（各层 Shader 共享） ----
const NOISE_GLSL = `
float hash3D(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3D(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3D(i),hash3D(i+vec3(1,0,0)),f.x),mix(hash3D(i+vec3(0,1,0)),hash3D(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3D(i+vec3(0,0,1)),hash3D(i+vec3(1,0,1)),f.x),mix(hash3D(i+vec3(0,1,1)),hash3D(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p) { float v=0.0,a=0.5; for(int j=0;j<3;j++){v+=a*noise3D(p);p=p*2.0+100.0;a*=0.5;} return v; }
`;

export class NebulaSystem {
  constructor() {
    this.nebulae = [];
    this.group = new THREE.Group();
    this._insideNebula = null;
    this._hud = null;
  }

  init(scene) {
    const cfg = config.nebula || {};
    const count = cfg.count || 3;
    const types = cfg.types || ['emission', 'reflection', 'dark'];

    for (let i = 0; i < count; i++) {
      const nebType = types[i % types.length];
      const colorCfg = (cfg.typeColors && cfg.typeColors[nebType]) || { r:0.5,g:0.2,b:0.6 };
      const baseColor = new THREE.Color(colorCfg.r, colorCfg.g, colorCfg.b);

      const nebGroup = new THREE.Group();
      const layers = this._createLayers(cfg, baseColor, nebType, i);
      layers.forEach(l => nebGroup.add(l.points));

      const spread = (config.stars?.spread || 10000) * 0.4;
      const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
      const r = spread * (0.1+Math.random()*0.8);
      nebGroup.position.set(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta)*0.3, r*Math.cos(phi));

      nebGroup.userData = {
        layers, nebType, baseColor,
        scale: cfg.scale || 800,
        rotSpeed: 0.0003+Math.random()*0.0008,
        turbulence: 0.3+Math.random()*0.4,
        driftDir: new THREE.Vector3((Math.random()-0.5)*0.4,(Math.random()-0.5)*0.1,(Math.random()-0.5)*0.4).normalize(),
      };
      this.group.add(nebGroup);
      this.nebulae.push(nebGroup);
    }
    scene.add(this.group);
    this._hud = window.engine?.hud || null;
    console.log('[NebulaSystem] v20 多层粒子星云初始化完成，共', count, '团');
  }

  _createLayers(cfg, baseColor, nebType, seed) {
    const scale = cfg.scale || 800;
    const defs = [
      { name:'outer', count:4000,  spMul:1.0,  opacity:0.6, size:5.0, cShift:0.0 },
      { name:'mid',   count:6000,  spMul:0.65, opacity:1.2, size:8.0, cShift:0.15 },
      { name:'inner', count:3000,  spMul:0.35, opacity:2.0, size:12.0, cShift:0.3 },
    ];
    return defs.map((def, li) => {
      const count = def.count, spread = scale*0.5*def.spMul;
      const pos = new Float32Array(count*3);
      const sizes = new Float32Array(count);
      const rands = new Float32Array(count);
      for (let i=0; i<count; i++) {
        const i3=i*3, th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
        const r2=spread*(0.1+Math.random()*0.9);
        pos[i3]=r2*Math.sin(ph)*Math.cos(th); pos[i3+1]=r2*Math.sin(ph)*Math.sin(th); pos[i3+2]=r2*Math.cos(ph);
        sizes[i]=def.size*(0.5+Math.random()*0.5); rands[i]=Math.random();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes,1));
      geo.setAttribute('aRandom', new THREE.BufferAttribute(rands,1));

      const mat = this._createMaterial(def, baseColor, spread, seed+li);
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
      return { points:pts, material:mat, config:def };
    });
  }

  _createMaterial(def, baseColor, spread, seed) {
    const c1 = baseColor.clone();
    const c2 = baseColor.clone().multiplyScalar(0.55);
    const cDark = new THREE.Color(0.12, 0.06, 0.04);
    const cWarm = new THREE.Color(0.8, 0.28, 0.12);
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime:{value:0}, uScale:{value:spread*2}, uOpacity:{value:def.opacity},
        uColor1:{value:c1}, uColor2:{value:c2}, uDarkDust:{value:cDark}, uWarmEdge:{value:cWarm},
        uTurbulence:{value:0.4}, uPixelRatio:{value:Math.min(window.devicePixelRatio,2)},
        uCameraPos:{value:new THREE.Vector3()},
      },
      vertexShader: `
        attribute float aSize; attribute float aRandom;
        varying float vAlpha,vDensity,vDistFromCenter,vRand; varying vec3 vWorldPos;
        uniform float uTime,uScale,uTurbulence,uPixelRatio,uOpacity; uniform vec3 uCameraPos;
        ${NOISE_GLSL}
        void main() {
          vec3 pos=position; vRand=aRandom;
          float turb=uTurbulence*uTime*0.25;
          pos.x+=sin(pos.y*0.15+turb*0.3)*uScale*0.008;
          pos.y+=cos(pos.z*0.15+turb*0.25)*uScale*0.008;
          pos.z+=sin(pos.x*0.15+turb*0.2)*uScale*0.008;
          float distC=length(position)/(uScale*0.5);
          float lr=uTime*0.025*(1.0-distC*0.3),ca=cos(lr),sa=sin(lr);
          float rx=pos.x*ca-pos.z*sa,rz=pos.x*sa+pos.z*ca;
          pos.x=rx; pos.z=rz;
          vec4 wp=modelMatrix*vec4(pos,1.0); vWorldPos=wp.xyz; vDistFromCenter=distC;
          float n=fbm3(position/(uScale*0.1)+uTime*0.004); vDensity=n;
          float rf=1.0-smoothstep(0.1,1.0,distC);
          vAlpha=rf*(0.3+n*0.7)*uOpacity;
          vec4 mv=modelViewMatrix*vec4(pos,1.0);
          gl_PointSize=aSize*uPixelRatio*(500.0/max(-mv.z,1.0));
          gl_PointSize=clamp(gl_PointSize,2.0,35.0);
          gl_Position=projectionMatrix*mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vAlpha,vDensity,vDistFromCenter,vRand; varying vec3 vWorldPos;
        uniform vec3 uColor1,uColor2,uDarkDust,uWarmEdge; uniform float uTime,uScale; uniform vec3 uCameraPos;
        ${NOISE_GLSL}
        void main() {
          float d=length(gl_PointCoord-0.5)*2.0;
          float da=1.0-smoothstep(0.0,1.0,d);
          float th=0.12+vDistFromCenter*0.15;
          if(vDensity<th||da<0.005)discard;
          // 暗尘埃
          float dn=fbm3(vWorldPos/(uScale*0.08)+17.0);
          float isDark=smoothstep(0.08,0.18,dn);
          // 颜色混合
          float ct=vDistFromCenter*0.7+(1.0-vDensity)*0.3;
          vec3 col=mix(uColor1,mix(uColor1,uColor2,0.5),smoothstep(0.1,0.5,ct));
          col=mix(col,mix(uColor2,uWarmEdge,0.5),smoothstep(0.4,0.85,ct));
          col=mix(col,uDarkDust,isDark*0.65);
          float a=da*vAlpha*(1.0-isDark*0.3);
          a=clamp(a,0.0,1.0); if(a<0.003)discard;
          gl_FragColor=vec4(col,a);
        }
      `,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    });
  }

  update(delta, elapsed, camera) {
    if (!camera) return;
    const cfg = config.nebula || {};
    const cm = config.celestialMotion;
    const ms = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;
    let closest = null, closestD = Infinity;
    this.nebulae.forEach((neb, idx) => {
      const d = neb.userData;
      const dist = neb.position.distanceTo(camera.position);
      const ns = d.scale || cfg.scale || 800;
      if (dist > (cfg.respawnDistance || 8000)) { this._respawn(neb, idx, camera, cfg); return; }
      if (dist < ns*0.5 && dist < closestD) { closestD = dist; closest = neb; }
      if (d.driftDir) neb.position.addScaledVector(d.driftDir, 0.4*delta*ms);
      d.layers.forEach(l => {
        if (l.material?.uniforms) {
          l.material.uniforms.uTime.value = elapsed;
          l.material.uniforms.uTurbulence.value = d.turbulence || 0.4;
          l.material.uniforms.uCameraPos.value.copy(camera.position);
        }
      });
    });
    if (closest && closest !== this._insideNebula) {
      this._insideNebula = closest;
      if (this._hud) { const t=closest.userData.nebType, n={emission:'发射星云',reflection:'反射星云',dark:'暗星云'}; this._hud.showMessage('已进入 '+(n[t]||'星云'),3000); }
    } else if (!closest && this._insideNebula) { this._insideNebula = null; }
  }

  updatePostEffects(uniforms, camera) {
    if (!camera || !this._insideNebula) { uniforms.uFogDensity.value = 0; return; }
    const cfg = config.nebula || {}, d = this._insideNebula.userData;
    const ns = d.scale || cfg.scale || 800, dist = this._insideNebula.position.distanceTo(camera.position);
    const fd = cfg.fogDistance || 300, md = cfg.fogDensity || 0.5;
    uniforms.uFogDensity.value = Math.max(0, Math.min(md, (1-dist/(ns*0.5))*md));
    const t = d.nebType;
    if (t==='emission') uniforms.uFogColor.value.set(0.25,0.08,0.05);
    else if (t==='reflection') uniforms.uFogColor.value.set(0.04,0.08,0.25);
    else uniforms.uFogColor.value.set(0.02,0.02,0.04);
  }

  _respawn(nebula, index, camera, cfg) {
    const cp = camera.position;
    const cx=Math.round(cp.x/2000),cy=Math.round(cp.y/2000),cz=Math.round(cp.z/2000);
    const rng = seededRandom(hashCoords(cx+index*7919,cy,cz));
    const th=rng()*Math.PI*2, ph=Math.acos(2*rng()-1);
    const r=(cfg.respawnMin||2000)+rng()*((cfg.respawnMax||6000)-(cfg.respawnMin||2000));
    const wp = new THREE.Vector3(cp.x+r*Math.sin(ph)*Math.cos(th), cp.y+r*Math.sin(ph)*Math.sin(th)*0.3, cp.z+r*Math.cos(ph));
    if (nebula.parent) { const im=new THREE.Matrix4().copy(nebula.parent.matrixWorld).invert(); wp.applyMatrix4(im); }
    nebula.position.copy(wp);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.nebulae.forEach(n => n.traverse(c => { if(c.geometry)c.geometry.dispose(); if(c.material)c.material.dispose(); }));
    this.nebulae = [];
  }
}
