'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { canWebGL, cssColor, loadThree, reducedMotion } from './three-loader';
import { STORE_NAMES, retailers } from '../../../packages/domain/retailer-registry';
import { categoryLabels } from '../../../packages/domain/categories';

// Three counter-rotating rings of price tags. Drag or scroll to spin them faster;
// fast spins push the tags back into depth. The phrase in the middle cycles.
const WORDS = ['Search.', 'Compare.', 'Track.', 'Save.'];
const UNIQUE = 24;

const post = `
  uniform sampler2D tDiffuse; uniform vec2 iResolution; uniform float iTime;
  uniform vec3 uBg; uniform float uShift; uniform float uGrain; uniform float uVig; uniform float uReveal;
  varying vec2 vUv;
  float rnd(vec2 co){ float dt = dot(co, vec2(12.9898, 78.233)); return fract(sin(mod(dt, 3.14)) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    float n = rnd(uv + iTime) * 0.5 + 0.5;
    vec2 off = uShift * vec2(cos(n), sin(n));
    vec4 t = texture2D(tDiffuse, uv + off * 0.5);
    vec3 col = vec3(texture2D(tDiffuse, uv + off).r, t.g, texture2D(tDiffuse, uv + off * 0.25).b);
    col += (rnd(uv + iTime) - 0.5) * uGrain;
    // vignette into the page paper instead of black
    float d = length(uv - 0.5);
    float m = pow(smoothstep(0.5, 0.3, d), 0.6);
    col = mix(col, uBg, (1.0 - m) * uVig);
    // circular reveal from white
    vec2 p = uv - 0.5; p.x *= iResolution.x / iResolution.y;
    float c = smoothstep(-0.2, 0.0, length(p) - uReveal * sqrt(2.2));
    col = mix(vec3(1.0), col, 1.0 - c);
    gl_FragColor = vec4(col, 1.0);
  }`;

/** A price tag drawn on canvas: category, store, and a redacted price bar (no made-up numbers). */
function tag(T: any, i: number, ink: string, accent: string) {
  const store = STORE_NAMES[i % STORE_NAMES.length];
  const categories = retailers[store].categories.includes('all')
    ? Object.keys(categoryLabels)
    : retailers[store].categories;
  const category = categories[
    Math.floor(i / STORE_NAMES.length) % categories.length
  ] as keyof typeof categoryLabels;
  const w = 256;
  const h = 320;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const r = 22;
  // paint the corners in the hero paper so the rounded tag edges don't show as black
  x.fillStyle = '#efe6d2';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(r, 0);
  x.arcTo(w, 0, w, h, r);
  x.arcTo(w, h, 0, h, r);
  x.arcTo(0, h, 0, 0, r);
  x.arcTo(0, 0, w, 0, r);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.08)';
  x.lineWidth = 3;
  x.stroke();
  // punched hole like a shop tag
  x.fillStyle = '#efe6d2';
  x.beginPath();
  x.arc(w / 2, 34, 11, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = ink;
  x.textAlign = 'left';
  x.font = '700 34px "Schibsted Grotesk", system-ui, sans-serif';
  x.fillText(categoryLabels[category] || category, 24, 118, w - 48);
  x.globalAlpha = 0.6;
  x.font = '500 20px "DM Mono", ui-monospace, monospace';
  x.fillText(store === 'Amazon' ? 'Amazon.in' : store, 24, 154, w - 48);
  x.globalAlpha = 1;
  x.fillStyle = 'rgba(0,0,0,0.07)';
  x.fillRect(24, 196, w - 48, 2);
  x.fillStyle = ink;
  x.font = '700 30px "Schibsted Grotesk", system-ui, sans-serif';
  x.fillText('₹', 24, 252);
  x.fillStyle = 'rgba(0,0,0,0.12)';
  x.fillRect(52, 228, 110 + ((i * 37) % 60), 26);
  x.fillStyle = accent;
  x.beginPath();
  x.arc(w - 36, 242, 9, 0, Math.PI * 2);
  x.fill();
  const t = new T.CanvasTexture(c);
  t.encoding = T.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}

export function RingHero() {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [word, setWord] = useState(0);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (reducedMotion() || paused) return;
    const iv = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 1800);
    return () => clearInterval(iv);
  }, [paused]);

  useEffect(() => {
    const F = frame.current;
    const cv = canvas.current;
    if (!F || !cv) return;
    if (!canWebGL()) {
      setReady(true);
      setAvailable(false);
      return;
    }
    let stop = () => {};
    let cancelled = false;
    loadThree()
      .then((T: any) => {
        if (cancelled) return;
        const reduce = reducedMotion() || paused;
        const r = new T.WebGLRenderer({ canvas: cv, antialias: true });
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        r.outputEncoding = T.sRGBEncoding;
        const bg = new T.Color(...cssColor(F, '--sea-paper'));
        r.setClearColor(bg, 1);
        const scene = new T.Scene();
        const cam = new T.PerspectiveCamera(50, 1, 0.1, 400);
        // closer than the full-screen original: the hero box is much smaller than a viewport
        cam.position.set(0, 0, 12.5);
        const ink = getComputedStyle(F).getPropertyValue('--v2-ink').trim() || '#1b2a25';
        const accent = getComputedStyle(F).getPropertyValue('--v2-green').trim() || '#1f7a55';
        const textures = Array.from({ length: UNIQUE }, (_, i) => tag(T, i, ink, accent));

        const sum = (n: number) => (n * (n + 1)) / 2;
        const RINGS = 3;
        const UNIT = 12;
        const R = 6.4;
        const rings: any[] = [];
        const lines: any[] = [];
        const geos: any[] = [];
        const mats: any[] = [];
        for (let i = 0; i < RINGS; i++) {
          const n = (sum(i + 1) - sum(i)) * UNIT;
          const ring = new T.Group();
          scene.add(ring);
          rings.push(ring);
          const s = 0.004 * 0.8 * (i * 0.36 + 1);
          const geo = new T.PlaneGeometry(256 * s * 1.9, 320 * s * 1.9);
          geos.push(geo);
          for (let j = 0; j < n; j++) {
            const line = new T.Group();
            ring.add(line);
            lines.push(line);
            const mat = new T.MeshBasicMaterial({ map: textures[(j + i * 7) % UNIQUE] });
            mats.push(mat);
            const mesh = new T.Mesh(geo, mat);
            mesh.position.x = R * (i + 1);
            mesh.rotation.z = -Math.PI / 2;
            line.rotation.z = (j / n) * Math.PI * 2;
            line.add(mesh);
          }
        }

        // render to a target, then grade it in one full-screen pass
        const target = new T.WebGLRenderTarget(1, 1, { samples: 4 });
        target.texture.encoding = T.sRGBEncoding;
        const postScene = new T.Scene();
        const postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const U = {
          tDiffuse: { value: target.texture },
          iResolution: { value: new T.Vector2(1, 1) },
          iTime: { value: 0 },
          uBg: { value: bg },
          uShift: { value: 0.0014 },
          uGrain: { value: 0.02 },
          uVig: { value: 0.5 },
          uReveal: { value: reduce ? 1 : 0 },
        };
        const quad = new T.Mesh(
          new T.PlaneGeometry(2, 2),
          new T.ShaderMaterial({
            uniforms: U,
            vertexShader:
              'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
            fragmentShader: post,
          }),
        );
        postScene.add(quad);

        const resize = () => {
          const b = F.getBoundingClientRect();
          r.setSize(b.width, b.height, false);
          const pr = r.getPixelRatio();
          target.setSize(b.width * pr, b.height * pr);
          U.iResolution.value.set(b.width, b.height);
          cam.aspect = b.width / Math.max(1, b.height);
          cam.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(F);
        resize();

        // wheel over the hero and drags both add spin; the page still scrolls normally
        let target2 = 0;
        let cur = 0;
        let delta = 0;
        const wheel = (e: WheelEvent) => (target2 += e.deltaY);
        let drag: { x: number; y: number } | null = null;
        const down = (e: PointerEvent) => (drag = { x: e.clientX, y: e.clientY });
        const move = (e: PointerEvent) => {
          if (!drag) return;
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          target2 -= (dx || dy) * 2;
          drag = { x: e.clientX, y: e.clientY };
        };
        const up = () => (drag = null);
        F.addEventListener('wheel', wheel, { passive: true });
        cv.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);

        const p = { reveal: U.uReveal.value, enter: reduce ? 1 : 0, speed: reduce ? 0 : 10 };
        const t0 = performance.now();
        const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        let visible = true;
        let raf = 0;
        const draw = (now: number) => {
          const el = (now - t0) / 1000;
          if (!reduce) {
            p.reveal = ease(Math.min(1, el / 1.0));
            const k = ease(Math.min(1, el / 1.5));
            p.enter = k;
            p.speed = 10 + (1 - 10) * k;
          }
          const prev = cur;
          cur += (target2 - cur) * 0.1;
          delta = cur - prev;
          rings.forEach((ring, i) => {
            ring.rotation.z += 0.0025 * (i % 2 === 1 ? -1 : 1) * (1 + delta) * p.speed;
          });
          const z = -100 * Math.min(1, Math.max(-1, delta / 1000)) + 10 * (1 - p.enter);
          lines.forEach((l) => (l.position.z = z));
          U.uReveal.value = p.reveal;
          U.iTime.value = el;
          r.setRenderTarget(target);
          r.render(scene, cam);
          r.setRenderTarget(null);
          r.render(postScene, postCam);
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
            visible = es[0].isIntersecting && document.visibilityState !== 'hidden';
            if (visible && !reduce) loop();
          },
          { threshold: 0.01 },
        );
        const visibility = () => {
          visible =
            document.visibilityState !== 'hidden' &&
            F.getBoundingClientRect().bottom > 0 &&
            F.getBoundingClientRect().top < window.innerHeight;
          if (visible && !reduce) loop();
        };
        document.addEventListener('visibilitychange', visibility);
        io.observe(F);
        if (reduce) draw(t0);
        else loop();
        setReady(true);
        stop = () => {
          cancelAnimationFrame(raf);
          io.disconnect();
          document.removeEventListener('visibilitychange', visibility);
          ro.disconnect();
          F.removeEventListener('wheel', wheel);
          cv.removeEventListener('pointerdown', down);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          textures.forEach((t) => t.dispose());
          geos.forEach((g) => g.dispose());
          mats.forEach((m) => m.dispose());
          target.dispose();
          quad.geometry.dispose();
          quad.material.dispose();
          r.dispose();
        };
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
          setAvailable(false);
        }
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [paused]);

  const w = WORDS[word];
  return (
    <div className={`v2-ring${ready ? ' ready' : ''}${paused ? ' paused' : ''}`} ref={frame}>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Three rings of store price tags turning around the words search, compare, track, save"
      />
      <div className="v2-ring-load" aria-hidden="true">
        {'LOADING'.split('').map((ch, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties}>
            {ch}
          </span>
        ))}
      </div>
      <div className="v2-ring-copy">
        <p className="v2-ring-word" aria-live="off">
          <span className="sr-only">Search. Compare. Track. Save.</span>
          <span key={word} aria-hidden="true">
            {w.split('').map((ch, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        </p>
        <p className="v2-ring-hint">
          {available
            ? paused
              ? 'Animation paused'
              : 'Drag or scroll to spin'
            : 'Compare recorded prices across stores'}
        </p>
      </div>
      {available && (
        <button
          type="button"
          className="v2-ring-pause"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? 'Play animation' : 'Pause animation'}
        </button>
      )}
    </div>
  );
}
