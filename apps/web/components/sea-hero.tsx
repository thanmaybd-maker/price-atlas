'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { canWebGL, cssColor, loadModel, loadThree, reducedMotion } from './three-loader';

// Sea surface: swells roll toward a beach, shoal and wash up the sand. The far edge is the horizon.
const vertexShader = `
  uniform float uTime; uniform float uShore; varying float vH; varying vec3 vN; varying vec3 vW; varying float vSand; varying float vShoal;
  vec3 gerst(vec4 w, vec3 p, inout vec3 t, inout vec3 b){
    float k = 6.2831853 / w.w; float c = sqrt(9.8 / k); vec2 d = normalize(w.xy);
    float f = k * (dot(d, p.xz) - c * uTime); float a = w.z / k;
    t += vec3(-d.x*d.x*(w.z*sin(f)), d.x*(w.z*cos(f)), -d.x*d.y*(w.z*sin(f)));
    b += vec3(-d.x*d.y*(w.z*sin(f)), d.y*(w.z*cos(f)), -d.y*d.y*(w.z*sin(f)));
    return vec3(d.x*(a*cos(f)), a*sin(f), d.y*(a*cos(f)));
  }
  void main(){
    vec3 p = position; vec3 t = vec3(1.,0.,0.); vec3 b = vec3(0.,0.,1.); vec3 q = vec3(0.);
    // wave groups: the long swell is taller in some stretches than others, so crests break into lengths
    float grp = 0.62 + 0.38 * sin(p.x * 0.17 + p.z * 0.04 + sin(p.x * 0.05) * 2.0);
    q += gerst(vec4(0.06, 1.0, 0.36 * grp, 7.5), p, t, b);
    q += gerst(vec4(-0.25, 1.0, 0.3, 4.6), p, t, b);
    q += gerst(vec4(0.4, 1.0, 0.15, 2.4), p, t, b);
    q += gerst(vec4(1.0, 0.35, 0.06, 1.2), p, t, b);
    // swells shrink and steepen as the water gets shallow, then run up the beach
    float shoal = 0.35 * (1.0 - smoothstep(uShore - 0.5, uShore + 1.5, p.z)) + 0.65 * smoothstep(uShore + 1.0, uShore - 9.0, p.z);
    q *= shoal; vShoal = max(shoal, 0.05);
    // the last metre: water surges up the sand and drains back, unevenly along the beach
    float near = smoothstep(uShore - 6.0, uShore, p.z) * (1.0 - smoothstep(uShore + 1.0, uShore + 3.0, p.z));
    q.y += near * 0.14 * sin(uTime * 1.05 - p.z * 0.8 + sin(p.x * 0.21) * 1.6 + sin(p.x * 0.07) * 2.0);
    vec3 pos = p + q;
    vN = normalize(cross(b, t)); vH = q.y;
    vec4 wp = modelMatrix * vec4(pos, 1.0); vW = wp.xyz;
    vSand = (wp.z - uShore) * 0.22;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const fragmentShader = `
  uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 foam; uniform vec3 ink; uniform vec3 haze; uniform float uTime; uniform float uFar;
  varying float vH; varying vec3 vN; varying vec3 vW; varying float vSand; varying float vShoal;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
  // hard, anti-aliased edge: every colour change is a carved line, never a gradient
  float cut(float edge, float x){ float w = fwidth(x) * 0.8; return smoothstep(edge - w, edge + w, x); }
  void main(){
    vec3 n = normalize(vN);
    float l = clamp(dot(n, normalize(vec3(-0.35, 0.85, 0.4))), 0., 1.);
    float s = clamp(vH * 0.55 + 0.42 + (l - 0.8) * 1.4, 0., 1.);
    vec3 col = s < 0.3 ? c0 : s < 0.55 ? c1 : s < 0.8 ? c2 : c3;
    // carved flow lines that follow each swell
    float stv = vH * 6.0 + noise(vW.xz * 0.25) * 0.8;
    float cl = abs(fract(stv) - 0.5); float w = fwidth(stv) * 1.1;
    col = mix(col, c3, (1.0 - smoothstep(0.0, w, cl)) * 0.45 * smoothstep(-0.2, 0.3, vH));
    // a clean rounded foam cap on each crest, outlined in ink
    float fo = (vH / vShoal) * 1.25 + noise(vW.xz * 1.1 + vec2(0., uTime * 0.2)) * 0.22 + (noise(vec2(vW.x * 0.3, vW.z * 0.12)) - 0.5) * 0.55;
    float dist = length(vW.xz - cameraPosition.xz);
    float nearF = 1.0 - smoothstep(18.0, 70.0, dist);
    float fm = cut(0.88, fo) * nearF;
    float rim = cut(0.82, fo) * nearF - fm;
    col = mix(col, ink, rim * 0.75);
    col = mix(col, foam, fm);
    // shallow water near the beach lightens, then a lace of foam where the wave ends
    float depth = vH - vSand;
    float dn = depth + (noise(vW.xz * 1.7 + uTime * 0.3) - 0.5) * 0.05;
    col = mix(col, c2, (1.0 - cut(0.42, dn)) * 0.85);
    col = mix(col, c3, 1.0 - cut(0.2, dn));
    col = mix(col, ink, (1.0 - cut(0.05, dn)) * 0.65);
    col = mix(col, foam, 1.0 - cut(0.038, dn));
    // distance haze, then one ink line where the sea meets the sky
    col = mix(col, haze, smoothstep(30.0, 150.0, dist) * 0.85);
    col = mix(col, ink, smoothstep(uFar + 9.0, uFar + 3.0, vW.z));
    gl_FragColor = vec4(col, 1.0);
  }`;

// The beach the waves run up onto.
const sandVertex = `
  varying vec3 vW;
  void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const sandFragment = `
  uniform vec3 sand; uniform vec3 wet; uniform vec3 ink; uniform float uShore;
  varying vec3 vW;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    float h = (vW.z - uShore) * 0.22;
    // the wet line wanders where the last waves reached
    float hw = h + sin(vW.x * 0.55) * 0.025 + sin(vW.x * 0.19 + 1.3) * 0.03;
    float w = fwidth(hw) * 0.8;
    vec3 col = mix(wet, sand, smoothstep(0.13 - w, 0.13 + w, hw));
    // fine round stipple, like grain pressed into the print
    vec2 q = vW.xz * vec2(16.0, 22.0); vec2 g = floor(q); vec2 f = fract(q) - 0.5;
    float r = 0.12 + 0.16 * hash(g + 3.1);
    float dotm = step(0.72, hash(g)) * (1.0 - smoothstep(r - 0.06, r, length(f)));
    col = mix(col, ink, dotm * 0.13);
    gl_FragColor = vec4(col, 1.0);
  }`;

// One breaking wave, modelled in Blender (public/models/wave.glb): a curling crest that tapers to a
// point at both ends. Vertex colour R marks the lip foam, G the height up the face.
const waveVertex = `
  uniform float uRise; uniform float uOut; varying vec3 vN; varying vec3 vW; varying vec2 vC;
  void main(){
    vec3 p = position; p.y *= uRise;
    // inverted hull: the outline pass pushes the shell out along the normal
    p += normal * uOut;
    vN = normalize(mat3(modelMatrix) * normal); vC = color.rg;
    vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const waveFragment = `
  uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 foam; uniform vec3 ink; uniform vec3 haze;
  uniform float uBreak; uniform float uTime; uniform float uLine;
  varying vec3 vN; varying vec3 vW; varying vec2 vC;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
  float cut(float e, float x){ float w = fwidth(x) * 0.8; return smoothstep(e - w, e + w, x); }
  void main(){
    float dist = length(vW.xz - cameraPosition.xz);
    if (uLine > 0.5) { gl_FragColor = vec4(mix(ink, haze, smoothstep(30.0, 150.0, dist) * 0.85), 1.0); return; }
    vec3 n = normalize(vN);
    float l = dot(n, normalize(vec3(-0.35, 0.8, 0.45))) * 0.5 + 0.5;
    float s = l * 0.7 + vC.g * 0.45;
    vec3 col = s < 0.38 ? c0 : s < 0.62 ? c1 : s < 0.86 ? c2 : c3;
    // carved lines climbing the face toward the lip
    float stv = vC.g * 7.0 + noise(vW.xz * 0.6) * 0.5;
    col = mix(col, c3, (1.0 - cut(0.08, abs(fract(stv) - 0.5))) * 0.35 * step(vC.r, 0.5));
    // the lip is foam; as the wave breaks the foam pours down the face
    float f = vC.r * 0.9 + vC.g * uBreak * 1.1 + (noise(vW.xz * 2.2 + uTime * 0.4) - 0.5) * 0.25;
    col = mix(col, ink, cut(0.5, f) - cut(0.58, f));
    col = mix(col, foam, cut(0.58, f));
    col = mix(col, haze, smoothstep(30.0, 150.0, dist) * 0.85);
    gl_FragColor = vec4(col, 1.0);
  }`;

const FAR = -360;
const SHORE = 3.7;

/** A Japanese woodblock-print ocean: Gerstner swells in flat Prussian-blue bands, flow lines and foam. */
export function SeaHero() {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const F = frame.current;
    const cv = canvas.current;
    if (!F || !cv || !canWebGL()) return;
    let stop = () => {};
    let cancelled = false;
    loadThree()
      .then((T: any) => {
        if (cancelled) return;
        const reduce = reducedMotion();
        const r = new T.WebGLRenderer({
          canvas: cv,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        r.setClearColor(0x000000, 0);
        const scene = new T.Scene();
        const cam = new T.PerspectiveCamera(46, 1, 0.1, 200);
        // Rows are packed near the camera and spread toward the horizon, so close swells stay smooth.
        const geo = new T.PlaneGeometry(1, 1, 300, 340);
        const pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const u = pa.getX(i) + 0.5;
          const v = pa.getY(i) + 0.5;
          const z = 6 + (FAR - 6) * Math.pow(v, 2.3);
          const half = 14 + (-z + 6) * 1.3;
          pa.setXYZ(i, (u - 0.5) * 2 * half, 0, z);
        }
        geo.computeBoundingSphere();
        const col = (n: string) => new T.Color(...cssColor(F, n));
        const U = {
          uTime: { value: 0 },
          uShore: { value: SHORE },
          uFar: { value: FAR },
          c0: { value: col('--sea-c0') },
          c1: { value: col('--sea-c1') },
          c2: { value: col('--sea-c2') },
          c3: { value: col('--sea-c3') },
          foam: { value: col('--sea-foam') },
          ink: { value: col('--sea-ink') },
          haze: { value: col('--sea-haze') },
        };
        const mat = new T.ShaderMaterial({ uniforms: U, vertexShader, fragmentShader });
        mat.extensions.derivatives = true;
        const sea = new T.Mesh(geo, mat);
        sea.frustumCulled = false;
        scene.add(sea);
        const sandGeo = new T.PlaneGeometry(60, 12, 1, 1);
        sandGeo.rotateX(-Math.PI / 2);
        // tilt so height rises 0.22 per unit toward the viewer, matching the shader
        sandGeo.rotateX(-Math.atan(0.22));
        const sandMat = new T.ShaderMaterial({
          uniforms: {
            sand: { value: col('--sea-sand') },
            wet: { value: col('--sea-wet') },
            ink: U.ink,
            uShore: U.uShore,
          },
          vertexShader: sandVertex,
          fragmentShader: sandFragment,
        });
        sandMat.extensions.derivatives = true;
        const sand = new T.Mesh(sandGeo, sandMat);
        sand.position.set(0, 0, SHORE);
        scene.add(sand);
        // Finite Blender waves roll in from the distance, stand up, break and dissolve on the sand.
        type Wave = { g: any; m: any; z: number; x: number; len: number; tall: number; v: number };
        const waves: Wave[] = [];
        const SPAWN = -34;
        const respawn = (w: Wave, z = SPAWN) => {
          w.z = z;
          w.x = (Math.random() - 0.5) * (14 + -z * 0.9);
          w.len = 0.55 + Math.random() * 0.5;
          w.tall = 1.25 + Math.random() * 0.6;
          w.v = 1.5 + Math.random() * 0.6;
        };
        loadModel('/models/wave.glb')
          .then((gltf: any) => {
            if (cancelled) return;
            let wg: any = null;
            gltf.scene.traverse((o: any) => {
              if (o.isMesh && !wg) wg = o.geometry;
            });
            if (!wg) return;
            for (let i = 0; i < 9; i++) {
              const mk = (line: boolean) =>
                new T.ShaderMaterial({
                  uniforms: {
                    ...U,
                    uRise: { value: 1 },
                    uBreak: { value: 0 },
                    uOut: { value: line ? 0.028 : 0 },
                    uLine: { value: line ? 1 : 0 },
                  },
                  vertexColors: true,
                  // the exported sweep winds inward (normals point out), so the faces swap roles
                  side: line ? T.FrontSide : T.BackSide,
                  vertexShader: waveVertex,
                  fragmentShader: waveFragment,
                });
              const m = mk(false);
              const ml = mk(true);
              m.extensions.derivatives = true;
              const g = new T.Group();
              g.add(new T.Mesh(wg, m));
              g.add(new T.Mesh(wg, ml));
              scene.add(g);
              const w: Wave = { g, m: [m, ml], z: 0, x: 0, len: 1, tall: 1, v: 1 };
              // stagger the set so the sea is already full when the page opens
              respawn(w, SPAWN + (i / 9) * (SHORE - 1 - SPAWN));
              waves.push(w);
            }
            // a still frame needs redrawing once the waves exist
            if (reduce) requestAnimationFrame(() => draw(0));
          })
          .catch(() => {});
        const stepWaves = (dt: number) => {
          waves.forEach((w) => {
            w.z += w.v * dt;
            if (w.z > SHORE - 0.4) respawn(w);
            // rise out of the far sea, stand tallest mid-way, collapse into foam at the shore
            const rise = Math.min(1, (w.z - SPAWN) / 9);
            const fall = 1 - Math.max(0, Math.min(1, (w.z - (SHORE - 6)) / 5.6));
            const brk = Math.max(0, Math.min(1, (w.z - (SHORE - 7)) / 5));
            w.g.position.set(w.x, -0.06, w.z);
            w.g.scale.set(w.len, w.tall, 1);
            w.m.forEach((m: any) => {
              m.uniforms.uRise.value = Math.max(0.02, rise * (0.25 + 0.75 * fall));
              m.uniforms.uBreak.value = brk;
            });
          });
        };
        // The horizon must sit exactly at the foot of the printed mountain in the SVG above.
        let pitch = 0.12;
        const resize = () => {
          const b = F.getBoundingClientRect();
          r.setSize(b.width, b.height, false);
          cam.aspect = b.width / Math.max(1, b.height);
          cam.updateProjectionMatrix();
          // SVG is xMidYMin slice: scale is the larger ratio, top-anchored
          const k = Math.max(b.width / 800, b.height / 560);
          const hy = 186 * k;
          const ndc = 1 - (2 * hy) / Math.max(1, b.height);
          const tanHalf = Math.tan(((cam.fov / 2) * Math.PI) / 180);
          // a point at infinity straight ahead lands at ndc = tan(pitch)/tanHalf; lift a hair for the far edge
          pitch = -Math.atan(ndc * tanHalf) - 0.006;
        };
        const ro = new ResizeObserver(resize);
        ro.observe(F);
        resize();
        let px = 0,
          py = 0,
          tx = 0,
          ty = 0,
          visible = true,
          raf = 0;
        const move = (e: PointerEvent) => {
          const b = F.getBoundingClientRect();
          tx = (e.clientX - b.left) / b.width - 0.5;
          ty = (e.clientY - b.top) / b.height - 0.5;
        };
        const leave = () => {
          tx = 0;
          ty = 0;
        };
        F.addEventListener('pointermove', move);
        F.addEventListener('pointerleave', leave);
        const t0 = performance.now();
        let last = t0;
        const draw = (now: number) => {
          const t = reduce ? 4 : (now - t0) / 1000;
          stepWaves(reduce ? 0 : Math.min(0.05, (now - last) / 1000));
          last = now;
          px += (tx - px) * 0.04;
          py += (ty - py) * 0.04;
          U.uTime.value = t * 0.9;
          cam.position.set(Math.sin(t * 0.07) * 0.6 + px * 1.4, 1.9, 8);
          // only yaw follows the pointer; pitch stays locked so the horizon never leaves the mountain
          cam.rotation.set(pitch, -px * 0.05, 0, 'YXZ');
          r.render(scene, cam);
        };
        const loop = () => {
          cancelAnimationFrame(raf);
          const f = (n: number) => {
            if (!visible) return;
            draw(n);
            raf = requestAnimationFrame(f);
          };
          raf = requestAnimationFrame(f);
        };
        const io = new IntersectionObserver(
          (es) => {
            visible = es[0].isIntersecting;
            if (visible && !reduce) loop();
          },
          { threshold: 0.01 },
        );
        io.observe(F);
        if (reduce) draw(0);
        else loop();
        F.dataset.ready = 'true';
        stop = () => {
          cancelAnimationFrame(raf);
          io.disconnect();
          ro.disconnect();
          F.removeEventListener('pointermove', move);
          F.removeEventListener('pointerleave', leave);
          geo.dispose();
          mat.dispose();
          sandGeo.dispose();
          waves.forEach((w) => w.m.forEach((m: any) => m.dispose()));
          sandMat.dispose();
          r.dispose();
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  return (
    <div className="v2-sea" ref={frame}>
      <svg
        className="v2-sky"
        viewBox="0 0 800 560"
        preserveAspectRatio="xMidYMin slice"
        aria-hidden="true"
      >
        <circle className="v2-sun" cx="230" cy="78" r="40" />
        <path className="v2-fuji" d="M440 186 L540 104 Q556 92 572 104 L672 186 Z" />
        <path
          className="v2-snow"
          d="M522 120 L540 104 Q556 92 572 104 L590 120 L578 130 L566 118 L555 132 L544 120 L532 129 Z"
        />
        <path className="v2-cloud" d="M60 118 h150 M110 138 h120 M600 64 h110 M640 84 h70" />
        <path className="v2-still" d="M0 186 H800 V470 Q600 440 400 462 T0 452 Z" />
        <path className="v2-still-sand" d="M0 452 Q200 472 400 462 T800 470 V560 H0 Z" />
      </svg>
      <canvas
        ref={canvas}
        role="img"
        aria-label="A Japanese woodblock-style sea: foam-capped blue swells roll in from the horizon below a mountain and break on a sandy shore"
      />
    </div>
  );
}
