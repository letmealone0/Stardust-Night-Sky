import * as THREE from 'three';
import { config } from '../core/config.js';
import { randomRange, randomVector3 } from '../utils/random.js';

function mergeBufferGeometries(geometries) {
  let totalVerts = 0;
  const attrBuckets = {};
  let hasIndex = false;
  let totalIdx = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    totalVerts += pos.count;
    if (g.index) {
      hasIndex = true;
      totalIdx += g.index.count;
    }
    for (const key of Object.keys(g.attributes)) {
      if (!attrBuckets[key]) attrBuckets[key] = [];
      attrBuckets[key].push(g.attributes[key]);
    }
  }

  const merged = new THREE.BufferGeometry();
  for (const [key, arr] of Object.entries(attrBuckets)) {
    const first = arr[0];
    const itemSize = first.itemSize;
    const data = new Float32Array(totalVerts * itemSize);
    let offset = 0;
    for (const attr of arr) {
      data.set(attr.array, offset);
      offset += attr.array.length;
    }
    merged.setAttribute(key, new THREE.BufferAttribute(data, itemSize));
  }

  if (hasIndex) {
    const indices = [];
    let vertOffset = 0;
    for (const g of geometries) {
      const pos = g.getAttribute('position');
      const idx = g.index;
      if (idx) {
        for (let k = 0; k < idx.count; k++) {
          indices.push(idx.array[k] + vertOffset);
        }
      } else {
        for (let k = 0; k < pos.count; k++) {
          indices.push(k + vertOffset);
        }
      }
      vertOffset += pos.count;
    }
    merged.setIndex(indices);
  }

  return merged;
}

export class NebulaSystem {
  constructor() {
    this.nebulae = [];
    this.group = new THREE.Group();
  }

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

  createNebula(scale, position, color, opacity) {
    const group = new THREE.Group();
    group.position.copy(position);

    const cloudCount = 6 + Math.floor(Math.random() * 6);
    const geoRef = new THREE.SphereGeometry(scale * 0.15, 8, 8);
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

        float noise(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;

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
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);

          float center = 1.0 - length(vUv - 0.5) * 2.0;
          center = max(0.0, center);
          center = pow(center, 1.5);

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

    const geometries = [];
    for (let i = 0; i < cloudCount; i++) {
      const geo = geoRef.clone();
      const mat4 = new THREE.Matrix4().compose(
        new THREE.Vector3(
          randomRange(-scale * 0.3, scale * 0.3),
          randomRange(-scale * 0.2, scale * 0.2),
          randomRange(-scale * 0.3, scale * 0.3)
        ),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
        ),
        new THREE.Vector3(1, 1, 1)
      );
      geo.applyMatrix4(mat4);
      geometries.push(geo);
    }
    geoRef.dispose();

    const mergedGeo = mergeBufferGeometries(geometries);
    geometries.forEach(g => g.dispose());

    const mesh = new THREE.Mesh(mergedGeo, material);
    group.add(mesh);

    group.userData = {
      rotationSpeed: randomRange(0.0001, 0.0005),
      pulseSpeed: randomRange(0.1, 0.3),
      pulsePhase: Math.random() * Math.PI * 2,
      material,
    };

    this.nebulae.push(group);
    return group;
  }

  update(delta, elapsed) {
    this.nebulae.forEach((nebula) => {
      const data = nebula.userData;

      nebula.rotation.y += data.rotationSpeed;

      const pulse = Math.sin(elapsed * data.pulseSpeed + data.pulsePhase) * 0.1 + 1.0;
      nebula.scale.setScalar(pulse);

      if (data.material && data.material.uniforms) {
        data.material.uniforms.uTime.value = elapsed;
      }
    });
  }

  dispose(scene) {
    scene.remove(this.group);
    this.nebulae.forEach((nebula) => {
      nebula.children.forEach((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    this.nebulae = [];
  }
}
