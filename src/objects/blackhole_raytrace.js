/**
 * GARGANTUA 黑洞光线追踪 Shader
 * 基于 Schwarzschild 度量 null-geodesic raymarching
 * 几何单位: c = G = 1, RS = 1.0 (Schwarzschild 半径)
 * 适配自 GARGANTUA 参考实现
 */

import * as THREE from 'three';

export const BLACKHOLE_RAY_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    // 相机
    uCamPos: { value: new THREE.Vector3() },
    uCamDir: { value: new THREE.Vector3() },
    uCamUp: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3() },
    uAspect: { value: 1.0 },
    uFovScale: { value: 1.0 },
    // 黑洞
    uBHWorldPos: { value: new THREE.Vector3() },
    uInvScale: { value: 1.0 / 25.0 },
    // v29-fix: 盘面世界空间基底向量（旋转矩阵的列，用于把世界射线变换到盘局部空间）
    uDiskRot0: { value: new THREE.Vector3(1, 0, 0) },
    uDiskRot1: { value: new THREE.Vector3(0, 1, 0) },
    uDiskRot2: { value: new THREE.Vector3(0, 0, 1) },
    // 参数
    uTime: { value: 0 },
    uSteps: { value: 200 },
    uDin: { value: 1.6 },
    uDout: { value: 8.0 },
    uDopMax: { value: 1.85 },
    uOpNear: { value: 0.90 },
    uOpFar: { value: 0.75 },
    uDiskBright: { value: 1.0 },
    uStarBright: { value: 1.0 },
    uSkyFloor: { value: 0.04 },
    uRotSpeed: { value: 1.0 },
    uDebug: { value: 0 },
    // 模式
    uEnabled: { value: 0.0 },
    uBHScreenPos: { value: new THREE.Vector2(0, 0) },
    uSizeScale: { value: 3.0 },  // v29: 视觉缩放（1.0=物理, 3.0=放大3倍）
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    precision highp float;

    varying vec2 vUv;

    uniform sampler2D tDiffuse;
    uniform vec3  uCamPos;
    uniform vec3  uCamDir;
    uniform vec3  uCamUp;
    uniform vec3  uCamRight;
    uniform float uAspect;
    uniform float uFovScale;
    uniform vec3  uBHWorldPos;
    uniform float uInvScale;
    uniform vec3  uDiskRot0;
    uniform vec3  uDiskRot1;
    uniform vec3  uDiskRot2;
    uniform float uTime;
    uniform float uSteps;
    uniform float uDin;
    uniform float uDout;
    uniform float uDopMax;
    uniform float uOpNear;
    uniform float uOpFar;
    uniform float uDiskBright;
    uniform float uStarBright;
    uniform float uSkyFloor;
    uniform float uRotSpeed;
    uniform float uDebug;
    uniform float uEnabled;
    uniform vec2  uBHScreenPos;
    uniform float uSizeScale;

    #define RS 1.0

    // ---------------------------------------------------------------- hashes
    float hash13(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    vec3 hash33(vec3 p) {
      p = fract(p * vec3(0.1031, 0.1030, 0.0973));
      p += dot(p, p.yxz + 33.33);
      return fract((p.xxy + p.yxx) * p.zyx);
    }

    // ------------------------------------------------------- value noise / fbm
    float vnoise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash13(i);
      float n100 = hash13(i + vec3(1.0,0.0,0.0));
      float n010 = hash13(i + vec3(0.0,1.0,0.0));
      float n110 = hash13(i + vec3(1.0,1.0,0.0));
      float n001 = hash13(i + vec3(0.0,0.0,1.0));
      float n101 = hash13(i + vec3(1.0,0.0,1.0));
      float n011 = hash13(i + vec3(0.0,1.0,1.0));
      float n111 = hash13(i + vec3(1.0,1.0,1.0));
      return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
                 mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
    }

    float fbm(vec3 p) {
      float a = 0.5, s = 0.0;
      for (int k = 0; k < 5; k++) {
        s += a * vnoise(p);
        p = p * 2.03 + 11.3;
        a *= 0.5;
      }
      return s;
    }

    // ----------------------------------------------------------- color helpers
    vec3 blackbody(float t) {
      vec3 c = mix(vec3(0.55,0.06,0.01), vec3(1.0,0.42,0.10), smoothstep(0.0,0.55,t));
      c = mix(c, vec3(1.0,0.86,0.55), smoothstep(0.50,1.05,t));
      c = mix(c, vec3(0.85,0.92,1.25), smoothstep(1.05,1.90,t));
      return c;
    }

    mat3 rotAxis(vec3 a, float t) {
      a = normalize(a);
      float c = cos(t), s = sin(t), ic = 1.0 - c;
      return mat3(ic*a.x*a.x+c, ic*a.x*a.y+s*a.z, ic*a.x*a.z-s*a.y,
                  ic*a.x*a.y-s*a.z, ic*a.y*a.y+c, ic*a.y*a.z+s*a.x,
                  ic*a.x*a.z+s*a.y, ic*a.y*a.z-s*a.x, ic*a.z*a.z+c);
    }

    // ----------------------------------------------------------- galaxy & stars
    vec3 galaxy(vec3 dir) {
      vec3 n  = normalize(vec3(0.25,1.0,0.15));
      vec3 t1 = normalize(cross(n, vec3(0.0,0.0,1.0)));
      vec3 t2 = cross(n, t1);
      float w = dot(dir, n);
      float band = exp(-w * w * 7.0);
      vec2 uv = vec2(dot(dir,t1), dot(dir,t2));
      float cloud  = fbm(vec3(uv*2.6, 7.0));
      float cloud2 = fbm(vec3(uv*5.4+cloud*1.8, 13.0));
      float dust   = fbm(vec3(uv*4.2+4.7, 21.0));
      float dustMask = smoothstep(0.42,0.78,dust);
      vec3 col = mix(vec3(0.04,0.07,0.20), vec3(0.42,0.24,0.52),
                     smoothstep(0.30,0.92,cloud2));
      float inten = band * (0.30+0.90*cloud) * (1.0-0.62*dustMask) * 1.15;
      return col * inten;
    }

    vec3 starLayer(vec3 dir, mat3 rot, float scale, float thresh, float soft) {
      vec3 p = rot * dir * scale;
      vec3 id = floor(p);
      vec3 f = fract(p);
      float h = hash13(id+17.17);
      if (h < thresh) return vec3(0.0);
      vec3 sp = vec3(0.5) + 0.62*(hash33(id+3.71)-0.5);
      float d2 = dot(f-sp, f-sp);
      float core = exp(-d2 * soft);
      float halo = exp(-d2 * soft * 0.10) * 0.22;
      float bright = 0.30 + 1.6 * pow(hash13(id+9.3), 6.0);
      vec3 tint = mix(vec3(0.72,0.84,1.25), vec3(1.20,0.95,0.72), hash13(id+5.5));
      return tint * (core+halo) * bright * smoothstep(thresh, thresh+0.015, h);
    }

    vec3 starField(vec3 dir) {
      vec3 s = vec3(0.0);
      s += starLayer(dir, rotAxis(vec3(0.2,1.0,0.1),0.0),  9.0, 0.952, 230.0);
      s += starLayer(dir, rotAxis(vec3(0.5,0.8,0.3),1.9),  13.0,0.952, 270.0);
      s += starLayer(dir, rotAxis(vec3(0.9,0.3,0.6),3.7),  17.0,0.953, 310.0);
      s += starLayer(dir, rotAxis(vec3(0.1,0.6,0.9),5.1),  23.0,0.968, 350.0)*0.8;
      return s;
    }

    vec3 background(vec3 dir) {
      vec3 col = uSkyFloor * vec3(0.10,0.13,0.28);
      col += galaxy(dir);
      col += starField(dir);
      return col * uStarBright;
    }

    // -------------------------------------------------------------- accretion
    float ntFlux(float r) {
      float x = max(r, 3.001);
      return pow(x/3.0, -3.0) * (1.0 - sqrt(3.0/x));
    }

    float diskPattern(vec3 q, float qr, out float turbOut) {
      vec2 n2 = q.xz / qr;
      float omega = 1.1 * uRotSpeed * pow(3.0/qr, 1.5);
      float ph = omega * uTime;
      float cs = cos(ph), sn = sin(ph);
      vec2 rn = vec2(n2.x*cs - n2.y*sn, n2.x*sn + n2.y*cs);
      float det = 1.0 - smoothstep(4.0, 18.0, qr);
      float warp = fbm(vec3(rn*1.5, 3.0));
      float rad = qr * 0.55;
      float turb = fbm(vec3(rn*2.3+(warp-0.5)*1.4*det, rad*0.4));
      turbOut = turb;
      turb = 0.55 + 0.45*smoothstep(0.22,0.88,turb);
      float arcA = fbm(vec3(rn*3.1+(warp-0.5)*2.2*det, rad*3.4+5.0));
      float arcB = fbm(vec3(rn*22.0+(warp-0.5)*3.0*det, rad*6.0+9.0));
      float streak = mix(arcA, arcA*0.55+arcB*0.80, det);
      streak = 0.42 + 0.58*smoothstep(0.20,0.86,streak);
      float lane = fbm(vec3(rn*5.2+7.3, rad*1.15+2.0));
      float laneMask = 0.58 + 0.42*smoothstep(0.30,0.82,lane);
      return turb * streak * laneMask;
    }

    vec3 diskEmission(vec3 q, float qr, vec3 rayDir, out float patOut) {
      float flux = ntFlux(qr);
      float temp = pow(flux*10.0, 0.25);
      float pat = diskPattern(q, qr, patOut);
      float fade = 1.0 - smoothstep(uDout-14.0, uDout, qr);
      float I = flux * 11.0 * pat;
      I += exp(-pow((qr-3.1)*3.0, 2.0)) * 2.8;
      I *= fade;
      float ang = atan(q.z, q.x);
      vec3 tdir = normalize(vec3(-sin(ang),0.0,cos(ang)));
      float beta = sqrt(0.5/qr);
      float gamma = 1.0 / sqrt(max(1.0-beta*beta, 1e-4));
      float D = 1.0 / (gamma * (1.0 - dot(tdir*beta, rayDir)));
      D = clamp(D, 0.50, uDopMax);
      float g = sqrt(max(1.0-RS/qr, 0.0));
      return blackbody(temp*D*g) * I * (D*D*D*g);
    }

    vec3 diskGlow(float r) {
      float flux = ntFlux(r);
      float temp = pow(flux*10.0, 0.25);
      float g = sqrt(max(1.0-RS/r, 0.0));
      float fade = 1.0 - smoothstep(uDout-14.0, uDout, r);
      float I = flux*7.0 + exp(-pow((r-3.1)*3.0, 2.0))*1.4;
      return blackbody(temp*g) * I * g * fade;
    }

    void main() {
      if (uEnabled < 0.5) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      // v29: 构建相机射线（世界空间）— 缩窄 FOV 让黑洞视觉放大 uSizeScale 倍
      vec3 rd = normalize(
        uCamRight * ((vUv.x - 0.5) * 2.0 * uAspect * uFovScale / uSizeScale) +
        uCamUp * ((0.5 - vUv.y) * 2.0 * uFovScale / uSizeScale) +
        uCamDir
      );

      // v29-fix: 转换到盘面局部空间 (RS 单位，原点在黑洞中心，盘面在 y=0)
      vec3 worldOff = (uCamPos - uBHWorldPos) * uInvScale;
      vec3 ro = vec3(dot(worldOff,uDiskRot0), dot(worldOff,uDiskRot1), dot(worldOff,uDiskRot2));
      vec3 worldRd = rd * uInvScale;
      vec3 rdDisk = vec3(dot(worldRd,uDiskRot0), dot(worldRd,uDiskRot1), dot(worldRd,uDiskRot2));
      float rdLen = length(rdDisk);
      if (rdLen < 1e-8) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      rd = rdDisk / rdLen;

      vec3 pos = ro;
      vec3 vel = rd;
      vec3 col = vec3(0.0);
      float trans = 1.0;
      float minR = 1e5;
      float lastR = length(ro);
      int dbg = int(uDebug + 0.5);

      int maxSteps = int(uSteps + 0.5);

      for (int i = 0; i < 600; i++) {
        if (i >= maxSteps) break;
        float r = length(pos);
        if (r < 1.03 * RS) { trans = 0.0; lastR = r; break; }
        if (r > 45.0 && dot(pos, vel) > 0.0) { lastR = r; break; }
        minR = min(minR, r);

        vec3 h = cross(pos, vel);
        float h2 = dot(h, h);
        float r2 = r * r;
        vec3 acc = -1.5 * RS * h2 / (r2 * r2 * r) * pos;
        float dt = max(0.012, r * mix(0.02, 0.06, smoothstep(6.0, 20.0, r)));

        // 薄体散射光晕
        if (dbg != 2) {
          float absY = abs(pos.y);
          if (absY < 0.45 && r > uDin && r < uDout) {
            float density = exp(-absY * 30.0) * 0.03 *
                            (1.0 - smoothstep(10.0, max(uDout-1.0, 11.0), r));
            col += trans * diskGlow(r) * density * dt * uDiskBright;
          }
        }

        vel = normalize(vel + acc * dt);
        vec3 npos = pos + vel * dt;

        // 吸积盘平面交叉 (y = 0)
        if (pos.y * npos.y <= 0.0) {
          float t = abs(pos.y) / (abs(pos.y) + abs(npos.y) + 1e-5);
          vec3 q = mix(pos, npos, t);
          float qr = length(q.xz);
          if (qr > uDin && qr < uDout) {
            float pat = 0.0;
            vec3 em = vec3(0.0);
            if (dbg != 2) em = diskEmission(q, qr, vel, pat);
            if (dbg != 2) {
              float op = mix(uOpFar, uOpNear, 1.0 - smoothstep(4.0, 13.0, qr));
              op *= 1.0 - smoothstep(uDout-14.0, uDout, qr);
              col += trans * op * em * uDiskBright;
              trans *= 1.0 - op;
            }
          }
        }

        pos = npos;
        lastR = r;
        if (trans < 0.02) break;
      }

      // v29-fix: 光子环 @ 1.55 RS（增强亮度和锐度）
      if (dbg == 0 || dbg == 1) {
        float ring = exp(-pow((minR - 1.55) * 5.0, 2.0));
        col += trans * ring * vec3(1.0, 0.85, 0.65) * 0.45;
      }

      // v29-fix: 移除 coreGlow — 让真实盘结构和光子环主导画面，避免变成模糊色块

      // 透镜化背景
      if (dbg == 0 || dbg == 2) {
        if (trans > 0.0) {
          float dim = clamp((lastR - 1.03) * 0.45, 0.45, 1.0);
          col += trans * background(normalize(vel)) * dim;
        }
      }

      // v29: 屏幕空间混合 — 从远处 BH 只占几像素（自动显示为亮点），靠近铺满屏幕
      vec4 sceneColor = texture2D(tDiffuse, vUv);
      float screenDist = length(vUv - uBHScreenPos);

      // 动态过渡区：远距离小区域、近距离大区域，按 uSizeScale 放大
      float worldDist = length(uCamPos - uBHWorldPos);
      float transitionZone = (0.03 + 1.0 / max(worldDist * 0.15, 1.0)) * uSizeScale;
      float blend = 1.0 - smoothstep(transitionZone * 0.3, transitionZone * 1.5, screenDist);

      // BH 离屏时降回场景
      if (uBHScreenPos.x < -0.1 || uBHScreenPos.x > 1.1 ||
          uBHScreenPos.y < -0.1 || uBHScreenPos.y > 1.1) blend = 0.0;

      gl_FragColor = vec4(mix(sceneColor.rgb, col, blend), 1.0);
    }
  `,
};
