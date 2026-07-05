/**
 * 行星系统 v11
 * 5类PBR行星（岩石/气态/熔岩/冰原/流浪）+ 恒星系统型/流浪双轨道
 * + 卫星(20%) + 小行星带(30%) + 靠近信息显示
 */

import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange, randomChoice } from '../utils/random.js';
import { hashCoords, seededRandom } from '../utils/seededRandom.js';
import { isPositionValid, findValidPosition, collectAllPositions } from '../utils/spatial.js';

// v11: 行星类型参数
const TYPE_PARAMS = {
  rocky:  { color: [0.50,0.42,0.35], emissive: [0.02,0.02,0.03], roughness: 0.80, metalness: 0.10, hasAtm: true,  atmColor: [0.3,0.5,0.9], atmAlpha: 0.55, ringChance: 0.05 },
  gas:    { color: [0.70,0.60,0.40], emissive: [0.05,0.03,0.01], roughness: 0.30, metalness: 0.0,  hasAtm: true,  atmColor: [0.8,0.65,0.35], atmAlpha: 0.7, ringChance: 0.35 },
  lava:   { color: [0.60,0.25,0.10], emissive: [0.25,0.10,0.02], roughness: 0.60, metalness: 0.0,  hasAtm: true,  atmColor: [0.9,0.35,0.12], atmAlpha: 0.4, ringChance: 0.02 },
  ice:    { color: [0.80,0.85,1.00], emissive: [0.02,0.03,0.05], roughness: 0.20, metalness: 0.30, hasAtm: true,  atmColor: [0.45,0.65,1.0], atmAlpha: 0.5, ringChance: 0.10 },
  rogue:  { color: [0.25,0.22,0.20], emissive: [0.01,0.01,0.02], roughness: 0.90, metalness: 0.05, hasAtm: false, atmColor: [0,0,0],         atmAlpha: 0,   ringChance: 0.0 },
};

function _srng(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function generateColorMap(type, seed) {
  const w = 512, h = 256, canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), rng = _srng(seed);
  switch (type) {
    case 'rocky': {
      const hue = 15 + rng() * 20, sat = 15 + rng() * 25, lit = 28 + rng() * 22;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lit}%)`; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        const x = rng()*w, y = rng()*h, r = 1+rng()*6;
        ctx.fillStyle = `hsl(${hue+rng()*10-5},${sat*0.7}%,${30+rng()*35}%)`;
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
      for (let i = 0; i < 25; i++) {
        const x = rng()*w, y = rng()*h, r = 4+rng()*14;
        ctx.fillStyle = `hsl(0,0%,${8+rng()*12}%)`; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = `hsl(0,0%,${22+rng()*10}%)`; ctx.beginPath(); ctx.arc(x+r*0.3,y-r*0.25,r*0.55,0,Math.PI*2); ctx.fill();
      }
      break; }
    case 'gas': {
      const hb = 25 + rng() * 35, img = ctx.getImageData(0,0,w,h), d = img.data;
      for (let y = 0; y < h; y++) {
        const band = Math.sin(y*0.08+rng()*3)*0.5+0.5, hue = hb+band*25+Math.sin(y*0.04+rng()*2)*8;
        const sat = (30+band*35)/100, lit = (38+band*32)/100;
        const cc = (1-Math.abs(2*lit-1))*sat, x2 = cc*(1-Math.abs(((hue/60)%2)-1)), m = lit-cc/2;
        let rr,gg,bb; const hh = hue/60;
        if(hh<1){rr=cc;gg=x2;bb=0;}else if(hh<2){rr=x2;gg=cc;bb=0;}else if(hh<3){rr=0;gg=cc;bb=x2;}
        else if(hh<4){rr=0;gg=x2;bb=cc;}else if(hh<5){rr=x2;gg=0;bb=cc;}else{rr=cc;gg=0;bb=x2;}
        for (let x = 0; x < w; x++) { const i=(y*w+x)*4; d[i]=Math.round((rr+m)*255); d[i+1]=Math.round((gg+m)*255); d[i+2]=Math.round((bb+m)*255); d[i+3]=255; }
      }
      ctx.putImageData(img,0,0);
      for (let i = 0; i < 12; i++) { const cx=rng()*w,cy=rng()*h,cr=3+rng()*12; const g=ctx.createRadialGradient(cx,cy,0,cx,cy,cr); g.addColorStop(0,`hsla(${hb+40+rng()*20},60%,55%,0.35)`); g.addColorStop(1,'hsla(0,0%,0%,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); }
      break; }
    case 'lava': {
      ctx.fillStyle='#140805'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='hsla(15,100%,50%,0.5)'; ctx.lineWidth=1.5+rng()*2.5;
      for(let i=0;i<18;i++){ctx.beginPath();let cx=rng()*w,cy=rng()*h;ctx.moveTo(cx,cy);for(let j=0;j<25;j++){cx+=(rng()-0.5)*24;cy+=(rng()-0.5)*16;ctx.lineTo(cx,cy);}ctx.stroke();}
      for(let i=0;i<120;i++){const cx=rng()*w,cy=rng()*h,cr=4+rng()*20;const g=ctx.createRadialGradient(cx,cy,0,cx,cy,cr);g.addColorStop(0,`hsla(${10+rng()*25},100%,${40+rng()*40}%,${0.3+rng()*0.4})`);g.addColorStop(1,'hsla(15,100%,25%,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,cr,0,Math.PI*2);ctx.fill();}
      break; }
    case 'ice': {
      const bl=58+rng()*30,img=ctx.getImageData(0,0,w,h),d=img.data;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=Math.sin(x*0.018+y*0.025)*Math.cos(y*0.012-x*0.016)*0.5+0.5;const v=(bl+n*22)/100,s=(8+n*22)/100,cc=(1-Math.abs(2*v-1))*s,x2=cc*(1-Math.abs((210/60%2)-1)),m=v-cc/2;let rr,gg,bb;const hh=210/60;if(hh<1){rr=cc;gg=x2;bb=0;}else if(hh<2){rr=x2;gg=cc;bb=0;}else if(hh<3){rr=0;gg=cc;bb=x2;}else if(hh<4){rr=0;gg=x2;bb=cc;}else if(hh<5){rr=x2;gg=0;bb=cc;}else{rr=cc;gg=0;bb=x2;}const i=(y*w+x)*4;d[i]=Math.round((rr+m)*255);d[i+1]=Math.round((gg+m)*255);d[i+2]=Math.round((bb+m)*255);d[i+3]=255;}
      ctx.putImageData(img,0,0);
      for(let i=0;i<35;i++){ctx.strokeStyle=`hsla(200,25%,85%,${0.25+rng()*0.4})`;ctx.lineWidth=0.4+rng()*1.2;ctx.beginPath();let cx=rng()*w,cy=rng()*h;ctx.moveTo(cx,cy);for(let j=0;j<12;j++){cx+=(rng()-0.5)*28;cy+=(rng()-0.5)*14;ctx.lineTo(cx,cy);}ctx.stroke();}
      break; }
    case 'rogue': {
      const hue=200+rng()*30,lit=15+rng()*12;
      ctx.fillStyle=`hsl(${hue},8%,${lit}%)`;ctx.fillRect(0,0,w,h);
      for(let i=0;i<60;i++){const x=rng()*w,y=rng()*h,r=3+rng()*15;ctx.fillStyle=`hsla(200,15%,${50+rng()*20}%,${0.15+rng()*0.2})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
      for(let i=0;i<30;i++){const x=rng()*w,y=rng()*h,r=3+rng()*12;ctx.fillStyle=`hsl(0,0%,${6+rng()*10}%)`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
      break; }
  }
  const tex = new THREE.CanvasTexture(canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
}

function generateNormalMap(colorTex) {
  const img = colorTex.image; if (!img) return null;
  const w = img.width, h = img.height, canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0,0,w,h), dst = ctx.createImageData(w,h);
  const gray = (i) => src.data[i]*0.299+src.data[i+1]*0.587+src.data[i+2]*0.114;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;const dx=gray((x+1+y*w)*4)-gray((x-1+y*w)*4);const dy=gray((x+(y+1)*w)*4)-gray((x+(y-1)*w)*4);const nx=-dx*5/255+0.5,ny=-dy*5/255+0.5,nz=1;const l=Math.sqrt(nx*nx+ny*ny+nz*nz);dst.data[i]=Math.round(((nx/l)*0.5+0.5)*255);dst.data[i+1]=Math.round(((ny/l)*0.5+0.5)*255);dst.data[i+2]=Math.round(((nz/l)*0.5+0.5)*255);dst.data[i+3]=255;}
  ctx.putImageData(dst,0,0);const tex=new THREE.CanvasTexture(canvas);tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.ClampToEdgeWrapping;return tex;
}

export class PlanetSystem {
  constructor() {
    this.planets = [];
    this.group = new THREE.Group();
    this.camera = null;
    this.sceneObjects = null;
    this._hud = null;
    this._infoShown = false;
  }

  setSceneObjects(sceneObjects) { this.sceneObjects = sceneObjects; }
  setCamera(camera) { this.camera = camera; }

  // v11: init — 5类行星+恒星系统型/流浪双轨道+卫星+小行星带
  init(scene) {
    const cfg = config.planets;
    const existingPositions = [new THREE.Vector3(0, 0, 0)];
    if (this.sceneObjects?.solarSystem?.planets) {
      this.sceneObjects.solarSystem.planets.forEach((p) => {
        const r = p.data.orbitRadius;
        existingPositions.push(new THREE.Vector3(r,0,0), new THREE.Vector3(-r,0,0),
          new THREE.Vector3(0,0,r), new THREE.Vector3(0,0,-r));
      });
    }
    const types = cfg.types || ['rocky','gas','lava','ice','rogue'];
    for (let i = 0; i < cfg.count; i++) {
      const radius = randomRange(cfg.minRadius, cfg.maxRadius);
      const type = types[i % types.length];
      const minDist = radius * 3 + 100;
      let position = findValidPosition(existingPositions, minDist,
        new THREE.Vector3(0,0,0), cfg.respawnMin, cfg.respawnMax, 50, 0.3);
      if (!position) {
        const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
        const r = cfg.respawnMin + Math.random()*(cfg.respawnMax-cfg.respawnMin);
        position = new THREE.Vector3(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta)*0.3, r*Math.cos(phi));
      }
      existingPositions.push(position);
      this.group.add(this._createPlanet(radius, position, i, type));
    }
    scene.add(this.group);
    this._hud = window.engine?.hud || null;
    console.log('[PlanetSystem] v11 行星系统初始化完成');
  }

  _createPlanet(radius, position, index, type) {
    const cfg = config.planets;
    const isRogue = type === 'rogue';
    const group = new THREE.Group(); group.position.copy(position);
    const colorMap = generateColorMap(type, index * 31337 + 42);
    const normalMap = generateNormalMap(colorMap);
    const tp = TYPE_PARAMS[type] || TYPE_PARAMS.rocky;
    const material = new THREE.MeshStandardMaterial({
      map: colorMap, normalMap, color: new THREE.Color(...tp.color),
      emissive: new THREE.Color(...tp.emissive), roughness: tp.roughness, metalness: tp.metalness,
    });
    const lod = new THREE.LOD();
    lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(radius,64,64), material), 0);
    lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(radius,32,32), material), 800);
    lod.addLevel(new THREE.Mesh(new THREE.SphereGeometry(radius,16,16), material), 2000);
    group.add(lod);
    let atmLod = null;
    if (tp.hasAtm) {
      const atmAlpha = tp.atmAlpha || 0.5;
      atmLod = new THREE.LOD();
      atmLod.addLevel(this._createAtmosphere(radius, tp.atmColor, atmAlpha, 64), 0);
      atmLod.addLevel(this._createAtmosphere(radius, tp.atmColor, atmAlpha, 32), 800);
      atmLod.addLevel(this._createAtmosphere(radius, tp.atmColor, atmAlpha, 16), 2000);
      group.add(atmLod);
    }
    if (Math.random() < tp.ringChance) group.add(this._createRing(radius));
    let hostStar = null;
    if (!isRogue) { hostStar = this._createHostStar(); group.add(hostStar); }
    let moonInstances = null;
    if (!isRogue && Math.random() < (cfg.moonChance || 0.2)) {
      moonInstances = this._createMoons(radius, 1 + Math.floor(Math.random() * (cfg.maxMoons || 3)));
      group.add(moonInstances.pivot);
    }
    let asteroidBelt = null;
    if (!isRogue && Math.random() < (cfg.asteroidBeltChance || 0.3)) {
      asteroidBelt = this._createAsteroidBelt(radius, cfg.asteroidBeltCount || 120);
      group.add(asteroidBelt.mesh);
    }
    group.add(this._createLabel(type, radius));
    const seed = index * 7919 + 13, rng = _srng(seed);
    group.userData = {
      index, radius, type, lod, atmLod,
      rotationSpeed: randomRange(0.005, 0.025),
      orbitSpeed: isRogue ? 0 : randomRange(0.002, 0.012),
      orbitRadius: isRogue ? 0 : (60 + rng() * 140),
      orbitAngle: rng() * Math.PI * 2,
      originalPosition: position.clone(),
      isRogue,
      driftDirection: isRogue ? new THREE.Vector3(rng()-0.5, (rng()-0.5)*0.2, rng()-0.5).normalize() : null,
      driftSpeed: isRogue ? randomRange(0.5, 2.0) : 0,
      hostStar, moonInstances, asteroidBelt,
      name: `${type.charAt(0).toUpperCase()+type.slice(1)}-${index+1}`,
    };
    this.planets.push(group);
    return group;
  }

  _createHostStar() {
    const r = config.planets.hostStarRadius || 8;
    const starGroup = new THREE.Group();
    starGroup.add(new THREE.Mesh(new THREE.SphereGeometry(r,16,16), new THREE.MeshBasicMaterial({color:0xffeedd})));
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vNormal; void main() { float i = pow(0.6 - dot(vNormal, vec3(0,0,1)), 2.0); gl_FragColor = vec4(1.0, 0.85, 0.6, i * 0.4); }`,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
    });
    starGroup.add(new THREE.Mesh(new THREE.SphereGeometry(r*2.5,16,16), glowMat));
    starGroup.userData.isHostStar = true;
    return starGroup;
  }

  _createMoons(planetRadius, count) {
    const pivot = new THREE.Group();
    const moonR = Math.max(1.5, planetRadius * 0.08);
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(moonR,12,12),
      new THREE.MeshStandardMaterial({color:0xaaaaaa,roughness:0.9,metalness:0.05}), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const moons = [], dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const orbitR = planetRadius*(1.8+i*0.6), speed = 0.01+Math.random()*0.02;
      const angle = Math.random()*Math.PI*2, tilt = (Math.random()-0.5)*0.4;
      moons.push({orbitR, speed, angle, tilt});
      dummy.position.set(Math.cos(angle)*orbitR, tilt*orbitR*0.3, Math.sin(angle)*orbitR);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; pivot.add(mesh);
    return { pivot, mesh, moons, dummy: new THREE.Object3D() };
  }

  _createAsteroidBelt(planetRadius, count) {
    const innerR = planetRadius*2.5, outerR = planetRadius*4.0;
    const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(planetRadius*0.02,0),
      new THREE.MeshStandardMaterial({color:0x665544,roughness:0.95,metalness:0.1}), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const asteroids = [], dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = Math.random()*Math.PI*2, r = innerR+Math.random()*(outerR-innerR);
      const y = (Math.random()-0.5)*planetRadius*0.3, speed = 0.001+Math.random()*0.003;
      asteroids.push({angle, r, y, speed});
      dummy.position.set(Math.cos(angle)*r, y, Math.sin(angle)*r);
      dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
      dummy.scale.setScalar(0.5+Math.random()); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, asteroids, dummy: new THREE.Object3D() };
  }

  _createAtmosphere(radius, atmColor, atmAlpha, segments) {
    const atmR = radius * (config.planets.atmosphereScale || 1.25);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAtmColor: { value: new THREE.Color(...atmColor) },
        uAtmAlpha: { value: atmAlpha || 0.5 },
        uSunPos: { value: new THREE.Vector3(0, 0, 0) },
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
        uniform vec3 uAtmColor;
        uniform float uAtmAlpha;
        uniform vec3 uSunPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 lightDir = normalize(uSunPos - vWorldPos);
          float sunAlign = max(0.0, dot(vNormal, lightDir));
          float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
          vec3 scatterColor = uAtmColor * (0.6 + sunAlign * 1.8);
          float rimPow = pow(rim, 2.2);
          float thickness = rimPow * (0.35 + sunAlign * 0.65);
          gl_FragColor = vec4(scatterColor, thickness * uAtmAlpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(atmR, segments, segments), mat);
  }

  _createRing(radius) {
    const geo = new THREE.RingGeometry(radius*1.4, radius*2.2, 128);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0,0,512,0);
    g.addColorStop(0,'rgba(180,160,140,0)'); g.addColorStop(0.2,'rgba(180,160,140,0.6)');
    g.addColorStop(0.5,'rgba(200,180,160,0.8)'); g.addColorStop(0.8,'rgba(180,160,140,0.6)'); g.addColorStop(1,'rgba(180,160,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,512,64);
    const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.rotation.x = Math.PI*0.5 + (Math.random()-0.5)*0.3;
    return ring;
  }

  _createLabel(type, radius) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(type.toUpperCase(), 128, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, depthTest: false}));
    sprite.position.y = radius*2.2; sprite.scale.set(radius*2.5, radius*2.5*0.25, 1);
    return sprite;
  }

  update(delta, elapsed) {
    const cfg = config.planets, cm = config.celestialMotion;
    if (!this.camera) return;
    const ms = (cm?.enabled !== false) ? (cm?.speedMultiplier || 1.0) : 0;
    this.planets.forEach((planet) => {
      const data = planet.userData;
      const dist = planet.position.distanceTo(this.camera.position);
      if (dist > cfg.respawnDistance) { this._respawnPlanet(planet, cfg); return; }
      if (data.lod) data.lod.update(this.camera);
      if (data.atmLod) data.atmLod.update(this.camera);
      const rot = data.rotationSpeed * ms;
      if (data.lod) for (let i = 0; i < data.lod.levels.length; i++) { const m = data.lod.levels[i].object; if (m) m.rotation.y += rot; }
      if (!data.isRogue && data.orbitSpeed > 0) {
        data.orbitAngle += data.orbitSpeed * ms;
        planet.position.x = data.originalPosition.x + Math.cos(data.orbitAngle) * data.orbitRadius * 0.4;
        planet.position.z = data.originalPosition.z + Math.sin(data.orbitAngle) * data.orbitRadius * 0.4;
      }
      if (data.isRogue && data.driftDirection) {
        planet.position.addScaledVector(data.driftDirection, data.driftSpeed * delta * ms);
        data.originalPosition.copy(planet.position);
      }
      if (data.moonInstances) this._updateMoons(data.moonInstances, ms);
      if (data.asteroidBelt) this._updateAsteroids(data.asteroidBelt, ms);
      // v13: 更新大气散射太阳位置
      if (data.atmLod) {
        let sunPos;
        if (data.hostStar) {
          sunPos = data.hostStar.getWorldPosition(new THREE.Vector3());
        } else if (this.sceneObjects?.solarSystem?.sun) {
          sunPos = this.sceneObjects.solarSystem.sun.getWorldPosition(new THREE.Vector3());
        }
        if (sunPos) {
          data.atmLod.traverse(child => {
            if (child.material?.uniforms?.uSunPos) child.material.uniforms.uSunPos.value.copy(sunPos);
          });
        }
      }
      if (dist < cfg.infoDistance) this._showInfo(data);
    });
    if (this._hud && this._infoShown) {
      if (!this.planets.some(p => p.position.distanceTo(this.camera.position) < cfg.infoDistance)) {
        this._hud.hideCelestialInfo(); this._infoShown = false;
      }
    }
  }

  _updateMoons(mi, ms) {
    mi.moons.forEach((m, i) => { m.angle += m.speed * ms;
      mi.dummy.position.set(Math.cos(m.angle)*m.orbitR, m.tilt*m.orbitR*0.3, Math.sin(m.angle)*m.orbitR);
      mi.dummy.updateMatrix(); mi.mesh.setMatrixAt(i, mi.dummy.matrix); });
    mi.mesh.instanceMatrix.needsUpdate = true;
  }

  _updateAsteroids(belt, ms) {
    belt.asteroids.forEach((a, i) => { a.angle += a.speed * ms;
      belt.dummy.position.set(Math.cos(a.angle)*a.r, a.y, Math.sin(a.angle)*a.r);
      belt.dummy.rotation.y += 0.002 * ms; belt.dummy.updateMatrix(); belt.mesh.setMatrixAt(i, belt.dummy.matrix); });
    belt.mesh.instanceMatrix.needsUpdate = true;
  }

  _showInfo(data) {
    if (!this._hud) this._hud = window.engine?.hud || null;
    if (!this._hud) return;
    this._infoShown = true;
    const details = [
      `半径: ${data.radius.toFixed(0)} AU`,
      data.isRogue ? '类型: 流浪行星（无宿主恒星）' : `轨道半径: ${data.orbitRadius.toFixed(0)} AU`,
      data.moonInstances ? `卫星: ${data.moonInstances.moons.length}` : '',
      data.asteroidBelt ? '含小行星带' : '',
    ].filter(Boolean).join('<br>');
    this._hud.showCelestialInfo(data.name, data.type, details);
  }

  _respawnPlanet(planet, cfg) {
    const camPos = this.camera.position, data = planet.userData;
    const cx = Math.round(camPos.x/1000), cy = Math.round(camPos.y/1000), cz = Math.round(camPos.z/1000);
    const seed = hashCoords(cx + data.index * 7919, cy, cz), rng = _srng(seed);
    const existingPositions = [];
    if (this.sceneObjects) collectAllPositions(this.sceneObjects).forEach(p => existingPositions.push(p));
    const selfIdx = existingPositions.findIndex(p => p.distanceToSquared(planet.position) < 1);
    if (selfIdx >= 0) existingPositions.splice(selfIdx, 1);
    const minDist = data.radius * 3 + 100;
    const newPos = findValidPosition(existingPositions, minDist, camPos, cfg.respawnMin, cfg.respawnMax, 30, 0.3);
    if (newPos) { planet.position.copy(newPos); } else {
      const theta = rng()*Math.PI*2, phi = Math.acos(2*rng()-1), r = cfg.respawnMin+rng()*(cfg.respawnMax-cfg.respawnMin);
      planet.position.set(camPos.x+r*Math.sin(phi)*Math.cos(theta), camPos.y+r*Math.sin(phi)*Math.sin(theta)*0.3, camPos.z+r*Math.cos(phi));
    }
    data.originalPosition.copy(planet.position);
    data.orbitRadius = data.isRogue ? 0 : (60+rng()*140);
    data.orbitSpeed = data.isRogue ? 0 : (0.002+rng()*0.01);
    data.orbitAngle = rng()*Math.PI*2;
    if (data.isRogue && data.driftDirection) data.driftDirection.set(rng()-0.5,(rng()-0.5)*0.2,rng()-0.5).normalize();
  }

  getPlanets() { return this.planets; }

  dispose(scene) {
    scene.remove(this.group);
    this.planets.forEach((planet) => { planet.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) { if (child.material.map) child.material.map.dispose(); if (child.material.normalMap) child.material.normalMap.dispose(); child.material.dispose(); }
    }); });
    this.planets = [];
  }
}
