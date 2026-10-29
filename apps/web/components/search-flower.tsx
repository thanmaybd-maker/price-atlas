'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { canWebGL, cssColor, loadModel, loadThree, reducedMotion } from './three-loader';

type Tone = '' | 'seen' | 'ok' | 'bad' | 'warn' | 'win';
type Step = { title: string; detail: string; tone: Tone };
const MAX_WAIT_PETALS = 7;

/**
 * A mechanical flower that grows one petal per step of a live lookup. The petals while waiting
 * are honest "still checking" steps; the final petals come from the real lookup result.
 */
export function SearchFlower({
  query,
  busy,
  found,
  message,
  onDone,
}: {
  query: string;
  busy: boolean;
  found: number;
  message: string;
  onDone: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ add: (tone: Tone) => void; finish: (cb: () => void) => void } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [flash, setFlash] = useState(false);
  const finished = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const queued = useRef<Tone[]>([]);
  const push = (s: Step) => {
    setSteps((prev) => [...prev, s]);
    if (api.current) api.current.add(s.tone);
    else queued.current.push(s.tone);
  };

  useEffect(() => {
    const F = frame.current;
    const cv = canvas.current;
    if (!F || !cv || !canWebGL()) return;
    let stop = () => {};
    let cancelled = false;
    Promise.all([loadThree(), loadModel('/models/flower.glb')])
      .then(([T, gltf]: any[]) => {
        if (cancelled) return;
        const reduce = reducedMotion();
        const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        r.setClearColor(0x000000, 0);
        r.outputEncoding = T.sRGBEncoding;
        r.toneMapping = T.ACESFilmicToneMapping;
        r.toneMappingExposure = 0.85;
        const scene = new T.Scene();
        const pm = new T.PMREMGenerator(r);
        const env = new T.Scene();
        env.add(
          new T.Mesh(
            new T.BoxGeometry(24, 14, 24),
            new T.MeshBasicMaterial({
              color: new T.Color(...cssColor(F, '--v2-paper')),
              side: T.BackSide,
            }),
          ),
        );
        // a dark floor in the reflection gives polished metal something to contrast against
        const floor = new T.Mesh(
          new T.PlaneGeometry(24, 24),
          new T.MeshBasicMaterial({
            color: new T.Color(...cssColor(F, '--v2-ink')),
            side: T.DoubleSide,
          }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -6.5;
        env.add(floor);
        [
          [-6, 5, -2, 5],
          [5, 6, 3, 4],
          [0, 7, 8, 9],
        ].forEach(([x, y, z, w]) => {
          const m = new T.MeshBasicMaterial({ color: 0xffffff });
          m.color.multiplyScalar(1.6);
          const pl = new T.Mesh(new T.PlaneGeometry(w, 3), m);
          pl.position.set(x, y, z);
          pl.lookAt(0, 0, 0);
          env.add(pl);
        });
        scene.environment = pm.fromScene(env, 0.04).texture;
        const cam = new T.PerspectiveCamera(30, 1, 0.1, 100);
        const camFrom = new T.Vector3(0, 4.4, 9.4);
        const camTop = new T.Vector3(0, 3.1, 0.02);
        const look = new T.Vector3(0, 0.05, 0);
        cam.position.copy(camFrom);
        cam.lookAt(look);
        const C = (n: string) => new T.Color(...cssColor(F, n));
        scene.add(new T.HemisphereLight(0xffffff, C('--v2-mint'), 0.6));
        const dl = new T.DirectionalLight(0xffffff, 1.3);
        dl.position.set(-4, 8, 5);
        scene.add(dl);
        const root = new T.Group();
        root.position.y = 0.35;
        root.scale.setScalar(0.86);
        scene.add(root);
        // The assembly was modelled in Blender (carbon-fibre plate, stem, hub, gear, stamens, core);
        // the two petal templates are cloned per lookup step and hinged at their origin.
        // Each lookup removes its templates; keep the cached scene reusable.
        const model = gltf.scene.clone(true);
        const node = (n: string) => model.getObjectByName(n);
        const tplOuter = node('PetalOuter');
        const tplInner = node('PetalInner');
        [tplOuter, tplInner].forEach((t: any) => t && t.parent && t.parent.remove(t));
        root.add(model);
        const hub = node('Hub') || new T.Group();
        const gear = node('Gear') || new T.Group();
        const coreMesh: any = node('Core');
        const coreM =
          coreMesh?.material || new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff });
        coreM.color = C('--v2-green');
        coreM.emissive = C('--v2-green');
        coreM.emissiveIntensity = 0.25;
        model.traverse((o: any) => {
          if (!o.isMesh) return;
          const m = o.material;
          // carbon reads as carbon only when the weave stays dark under a thin clear coat
          if (/^Carbon/.test(m.name)) {
            m.roughness = 0.38;
            m.envMapIntensity = 0.35;
          } else if (m.name === 'Panel') {
            m.roughness = 0.28;
            m.envMapIntensity = 0.45;
          } else m.envMapIntensity = 1.0;
        });
        const TONE: Record<string, any> = {
          '': C('--v2-petal'),
          seen: C('--v2-sky'),
          ok: C('--v2-petal-ok'),
          bad: C('--v2-bad'),
          warn: C('--v2-warn'),
          win: C('--v2-green'),
        };
        const N = 12;
        const petals = Array.from({ length: N }, (_, i) => {
          const inner = i % 2 === 1;
          const pivot = new T.Group();
          pivot.position.y = 0.84 + (inner ? 0.05 : 0);
          pivot.rotation.y = (i / N) * Math.PI * 2;
          root.add(pivot);
          const hinge = new T.Group();
          hinge.position.x = inner ? 0.3 : 0.46;
          pivot.add(hinge);
          const petal = (inner ? tplInner : tplOuter).clone(true);
          petal.position.set(0, 0, 0);
          let mat: any = null;
          petal.traverse((o: any) => {
            if (o.isMesh && o.material?.name === 'Panel') {
              o.material = o.material.clone();
              o.material.color = TONE[''].clone();
              mat = o.material;
            }
          });
          hinge.add(petal);
          hinge.scale.setScalar(0.001);
          return {
            hinge,
            mat: mat || new T.MeshStandardMaterial(),
            s: 0.001,
            sv: 0,
            sT: 0.001,
            a: 1.45,
            av: 0,
            aT: 1.45,
            open: inner ? 0.62 : 0.26,
            target: TONE[''].clone(),
          };
        });
        let used = 0,
          mode = 'grow',
          tMode = 0,
          spin = 0.0015,
          kick = 0,
          raf = 0,
          finishCb: (() => void) | null = null,
          doneOnce = false;
        api.current = {
          add: (tone) => {
            const p = petals[used % N];
            used++;
            p.sT = 1;
            p.aT = p.open + (Math.random() - 0.5) * 0.08;
            p.target.copy(TONE[tone] || TONE['']);
            kick = 1;
          },
          finish: (cb) => {
            finishCb = cb;
            mode = 'spin';
            tMode = performance.now();
            if (reduce) cb();
          },
        };
        queued.current.splice(0).forEach((tone) => api.current?.add(tone));
        const resize = () => {
          const b = F.getBoundingClientRect();
          r.setSize(b.width, b.height, false);
          cam.aspect = b.width / Math.max(1, b.height);
          cam.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(F);
        resize();
        const draw = (now: number) => {
          if (mode === 'spin') {
            spin += (0.14 - spin) * 0.03;
            if (now - tMode > 1700) {
              mode = 'zoom';
              tMode = now;
              petals.forEach((p) => {
                if (p.sT > 0.5) {
                  p.aT = -0.12;
                  p.sT = 1.5;
                }
              });
            }
          } else if (mode === 'grow') spin += (0.0015 + used * 0.0006 - spin) * 0.05;
          if (mode === 'zoom') {
            spin += (0.03 - spin) * 0.05;
            const z = Math.min(1, (now - tMode) / 1400);
            cam.position.lerpVectors(camFrom, camTop, 1 - Math.pow(1 - z, 3));
            if (z >= 1 && !doneOnce) {
              doneOnce = true;
              finishCb?.();
            }
          }
          cam.lookAt(look);
          if (!reduce) {
            root.rotation.y += spin;
            gear.rotation.y -= 0.004 + used * 0.002 + spin * 0.6;
          }
          kick *= 0.9;
          hub.scale.set(1 + kick * 0.12, 1 - kick * 0.08, 1 + kick * 0.12);
          coreM.emissiveIntensity = 0.25 + kick * 0.9 + (mode === 'spin' ? 0.4 : 0);
          petals.forEach((p) => {
            if (reduce) {
              p.s = p.sT;
              p.a = p.aT;
            } else {
              p.sv += (p.sT - p.s) * 0.12;
              p.sv *= 0.72;
              p.s += p.sv;
              p.av += (p.aT - p.a) * 0.08;
              p.av *= 0.76;
              p.a += p.av;
            }
            p.hinge.scale.setScalar(Math.max(0.001, p.s));
            p.hinge.rotation.z = p.a;
            p.mat.color.lerp(p.target, 0.08);
          });
          r.render(scene, cam);
          raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        F.dataset.ready = 'true';
        stop = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          r.dispose();
          api.current = null;
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // honest progress: two real local steps, then one "still checking" petal per wait interval
  const started = useRef('');
  const waited = useRef(0);
  const cacheShown = useRef(false);
  useEffect(() => {
    frame.current?.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (started.current !== query) {
      started.current = query;
      waited.current = 0;
      cacheShown.current = false;
      push({ title: 'Read your search', detail: `normalised “${query}”`, tone: '' });
    }
    timers.push(
      setTimeout(() => {
        if (cacheShown.current) return;
        cacheShown.current = true;
        push({
          title: 'Checked recent searches',
          detail: 'results are kept for 6 hours',
          tone: 'seen',
        });
      }, 600),
    );
    const iv = setInterval(() => {
      if (waited.current >= MAX_WAIT_PETALS || finished.current) return;
      waited.current++;
      push({
        title: 'Reading store pages',
        detail: 'search pages nominate, product pages decide',
        tone: 'seen',
      });
    }, 1700);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (busy || finished.current) return;
    finished.current = true;
    push(
      found
        ? {
            title: `Found ${found} product${found === 1 ? '' : 's'}`,
            detail: 'recorded product details are ready',
            tone: 'ok',
          }
        : { title: 'Nothing verified yet', detail: message, tone: 'bad' },
    );
    const t = setTimeout(() => {
      if (found)
        push({
          title: 'Results ready',
          detail: 'unknown shipping and unmatched variants stay separate',
          tone: 'win',
        });
      const end = () => {
        setFlash(true);
        setTimeout(() => doneRef.current(), 600);
      };
      if (api.current) api.current.finish(end);
      else end();
    }, 500);
    // A WebGL context loss must never hide completed search results.
    const fallback = setTimeout(() => doneRef.current(), 4500);
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const last = steps[steps.length - 1];
  return (
    <section className="v2-flower" ref={frame} aria-live="polite" aria-label="Search progress">
      <canvas ref={canvas} aria-hidden="true" />
      <div className="v2-fl-q">
        <span>“{query}”</span>
      </div>
      <ol className="v2-fl-trail" aria-hidden="true">
        {steps
          .slice(0, -1)
          .slice(-7)
          .map((s, i) => (
            <li key={i} className={s.tone}>
              {s.title}
            </li>
          ))}
      </ol>
      <div className="v2-fl-cap">
        <div className="n">{busy ? `petal ${steps.length}` : 'all petals in'}</div>
        {last && (
          <div key={steps.length} className="cap">
            <strong>{last.title}</strong>
            <span>{last.detail}</span>
          </div>
        )}
      </div>
      <button className="v2-fl-skip" onClick={() => doneRef.current()} disabled={busy}>
        {busy ? 'Checking…' : 'Show results'}
      </button>
      <div className={flash ? 'v2-flash on' : 'v2-flash'} aria-hidden="true" />
    </section>
  );
}
