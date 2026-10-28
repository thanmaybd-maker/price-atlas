'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { canWebGL, cssColor, loadThree, reducedMotion } from './three-loader';

const vertexShader = `
  uniform float uTime; varying float vH; varying vec3 vN; varying vec3 vW;
  vec3 gerst(vec4 w, vec3 p, inout vec3 t, inout vec3 b){
    float k = 6.2831853 / w.w; float c = sqrt(9.8 / k); vec2 d = normalize(w.xy);
    float f = k * (dot(d, p.xz) - c * uTime); float a = w.z / k;
    t += vec3(-d.x*d.x*(w.z*sin(f)), d.x*(w.z*cos(f)), -d.x*d.y*(w.z*sin(f)));
    b += vec3(-d.x*d.y*(w.z*sin(f)), d.y*(w.z*cos(f)), -d.y*d.y*(w.z*sin(f)));
    return vec3(d.x*(a*cos(f)), a*sin(f), d.y*(a*cos(f)));
  }
  void main(){
    vec3 p = position; vec3 t = vec3(1.,0.,0.); vec3 b = vec3(0.,0.,1.); vec3 q = p;
    q += gerst(vec4(0.18, 1.0, 0.5, 15.0), p, t, b);
    q += gerst(vec4(-0.45, 1.0, 0.34, 8.0), p, t, b);
    q += gerst(vec4(0.6, 1.0, 0.2, 4.2), p, t, b);
    q += gerst(vec4(1.0, 0.2, 0.12, 2.4), p, t, b);
    vN = normalize(cross(b, t)); vH = q.y;
    vec4 wp = modelMatrix * vec4(q, 1.0); vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const fragmentShader = `
  uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 foam; uniform vec3 ink; uniform vec3 paper; uniform float uTime;
  varying float vH; varying vec3 vN; varying vec3 vW;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
  void main(){
    vec3 n = normalize(vN);
    float l = clamp(dot(n, normalize(vec3(-0.35, 0.85, 0.4))), 0., 1.);
    float s = clamp(vH * 0.3 + 0.32 + (l - 0.78) * 1.3, 0., 1.);
    vec3 col = s < 0.3 ? c0 : s < 0.58 ? c1 : s < 0.84 ? c2 : c3;
    float stv = vH * 5.0 + vW.x * 0.05 + noise(vW.xz * 0.3) * 1.2;
    float cl = abs(fract(stv) - 0.5); float w = fwidth(stv) * 1.2;
    float line = 1.0 - smoothstep(0.0, w, cl);
    col = mix(col, c3, line * 0.6 * smoothstep(-1.6, 0.4, vH));
    float fo = vH * 0.62 + noise(vW.xz * 1.8 + uTime * 0.25) * 0.42 + noise(vW.xz * 5.0) * 0.18;
    float fm = smoothstep(0.98, 1.06, fo);
    float edge = smoothstep(0.9, 0.98, fo) - fm;
    col = mix(col, ink, edge * 0.8);
    col = mix(col, foam, fm);
    float dist = length(vW - cameraPosition);
    col = mix(col, paper, smoothstep(20.0, 50.0, dist) * 0.92);
    gl_FragColor = vec4(col, 1.0 - smoothstep(44.0, 52.0, dist));
  }`;

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
        const geo = new T.PlaneGeometry(90, 70, 320, 260);
        geo.rotateX(-Math.PI / 2);
        const col = (n: string) => new T.Color(...cssColor(F, n));
        const U = {
          uTime: { value: 0 },
          c0: { value: col('--sea-c0') },
          c1: { value: col('--sea-c1') },
          c2: { value: col('--sea-c2') },
          c3: { value: col('--sea-c3') },
          foam: { value: col('--sea-foam') },
          ink: { value: col('--sea-ink') },
          paper: { value: col('--sea-paper') },
        };
        const mat = new T.ShaderMaterial({
          uniforms: U,
          transparent: true,
          vertexShader,
          fragmentShader,
        });
        mat.extensions.derivatives = true;
        const sea = new T.Mesh(geo, mat);
        sea.position.z = -18;
        scene.add(sea);
        const resize = () => {
          const b = F.getBoundingClientRect();
          r.setSize(b.width, b.height, false);
          cam.aspect = b.width / Math.max(1, b.height);
          cam.updateProjectionMatrix();
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
        const draw = (now: number) => {
          const t = reduce ? 4 : (now - t0) / 1000;
          px += (tx - px) * 0.04;
          py += (ty - py) * 0.04;
          U.uTime.value = t * 0.9;
          cam.position.set(
            Math.sin(t * 0.07) * 1.2 + px * 3,
            3.0 + Math.sin(t * 0.45) * 0.3 - py * 1.0,
            7.5,
          );
          cam.lookAt(px * 2, -0.7, -12);
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
        <path className="v2-still" d="M0 200 Q200 180 400 196 T800 190 V560 H0 Z" />
      </svg>
      <canvas
        ref={canvas}
        role="img"
        aria-label="A three-dimensional ocean in the style of a Japanese woodblock print, foam-capped blue swells rolling toward you"
      />
    </div>
  );
}
