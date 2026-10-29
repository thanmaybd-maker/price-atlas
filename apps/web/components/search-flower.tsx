'use client';
import { useEffect, useRef, useState } from 'react';
import { canWebGL, loadThree, reducedMotion } from './three-loader';

type Tone = '' | 'seen' | 'ok' | 'bad' | 'warn' | 'win';
type Step = { title: string; detail: string; tone: Tone };
const MAX_WAIT_PETALS = 7;

// ---------------------------------------------------------------------------
// Organic 11-petal lotus. Petals illustrate lookup progress, not individual
// verified network requests: local input, cache/discovery waits, then results.
// Interleaved across inner (3), middle (4) and outer (4) whorls so any partial
// count still reads as a balanced bloom.
// ---------------------------------------------------------------------------
type Slot = {
  whorl: 'inner' | 'middle' | 'outer';
  azimuth: number; // around +Y (rad)
  baseTilt: number; // outward from vertical (rad)
  baseRadius: number;
  baseY: number;
  lengthScale: number;
  widthScale: number;
  cupDepth: number;
  asymmetry: number;
  twist: number;
  spawnAzimuthOffset: number;
  spawnElevation: number;
};
const S = (
  whorl: Slot['whorl'],
  azimuth: number,
  baseTilt: number,
  baseRadius: number,
  baseY: number,
  lengthScale: number,
  widthScale: number,
  cupDepth: number,
  asymmetry: number,
  twist: number,
  spawnAzimuthOffset: number,
  spawnElevation: number,
): Slot => ({
  whorl,
  azimuth,
  baseTilt,
  baseRadius,
  baseY,
  lengthScale,
  widthScale,
  cupDepth,
  asymmetry,
  twist,
  spawnAzimuthOffset,
  spawnElevation,
});
const SLOTS: Slot[] = [
  S('inner', 0.35, 0.42, 0.185, 0.055, 0.92, 0.92, 0.23, 0.022, 0.015, -0.95, 3.15),
  S('inner', 2.45, 0.44, 0.185, 0.055, 0.94, 0.93, 0.22, -0.02, -0.018, 0.92, 3.3),
  S('inner', 4.55, 0.43, 0.185, 0.055, 0.93, 0.91, 0.23, 0.018, 0.012, -1.05, 3.2),
  S('middle', 1.38, 0.64, 0.235, 0.02, 1.02, 1.01, 0.2, 0.028, 0.022, 1.08, 2.85),
  S('middle', 3.48, 0.66, 0.235, 0.02, 1.03, 1.0, 0.2, -0.025, -0.02, -0.82, 2.9),
  S('middle', 5.52, 0.63, 0.235, 0.022, 1.01, 1.02, 0.21, 0.02, -0.015, -0.95, 2.95),
  S('middle', 2.02, 0.67, 0.24, 0.018, 1.04, 0.99, 0.19, -0.022, 0.018, 0.78, 2.75),
  S('outer', 0.88, 0.88, 0.285, -0.015, 1.09, 1.06, 0.17, 0.03, 0.025, 1.02, 2.55),
  S('outer', 4.02, 0.9, 0.285, -0.015, 1.08, 1.05, 0.17, -0.028, -0.022, -1.0, 2.6),
  S('outer', 2.86, 0.89, 0.285, -0.015, 1.09, 1.05, 0.18, 0.024, 0.016, 0.88, 2.65),
  S('outer', 5.98, 0.91, 0.29, -0.018, 1.11, 1.07, 0.17, -0.016, 0.01, -0.68, 2.5),
];

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Ivory-to-blush petal colour map plus a fine venation bump map. */
function petalTextures(T: any) {
  const w = 512;
  const h = 1024;
  const cc = document.createElement('canvas');
  cc.width = w;
  cc.height = h;
  const ctx = cc.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0.0, '#ECE7D3');
  g.addColorStop(0.16, '#FCF8F0');
  g.addColorStop(0.48, '#FAE7ED');
  g.addColorStop(0.79, '#F3C5D3');
  g.addColorStop(0.95, '#E7A1B6');
  g.addColorStop(1.0, '#DD8EA6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const e = ctx.createLinearGradient(0, 0, w, 0);
  e.addColorStop(0.0, 'rgba(232, 158, 181, 0.20)');
  e.addColorStop(0.18, 'rgba(255, 248, 250, 0.0)');
  e.addColorStop(0.5, 'rgba(255, 252, 253, 0.14)');
  e.addColorStop(0.82, 'rgba(255, 248, 250, 0.0)');
  e.addColorStop(1.0, 'rgba(232, 158, 181, 0.20)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, w, h);
  const bc = document.createElement('canvas');
  bc.width = w;
  bc.height = h;
  const b = bc.getContext('2d') as CanvasRenderingContext2D;
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);
  const veins = 21;
  for (let i = 0; i < veins; i++) {
    const n = (i / (veins - 1)) * 2 - 1;
    const sx = w * 0.5 + n * w * 0.11;
    const mx = w * 0.5 + n * w * 0.39;
    const ex = w * 0.5 + n * w * 0.24;
    const mid = Math.abs(n) < 0.11;
    ctx.beginPath();
    ctx.moveTo(sx, h * 0.96);
    ctx.quadraticCurveTo(mx, h * 0.45, ex, h * 0.04);
    ctx.strokeStyle = mid ? 'rgba(220, 142, 166, 0.18)' : 'rgba(225, 154, 176, 0.11)';
    ctx.lineWidth = mid ? 2.0 : 1.2;
    ctx.stroke();
    b.beginPath();
    b.moveTo(sx, h * 0.96);
    b.quadraticCurveTo(mx, h * 0.45, ex, h * 0.04);
    b.strokeStyle = 'rgba(214, 214, 214, 0.35)';
    b.lineWidth = mid ? 2.3 : 1.35;
    b.stroke();
  }
  const map = new T.CanvasTexture(cc);
  map.encoding = T.sRGBEncoding;
  const bumpMap = new T.CanvasTexture(bc);
  return { map, bumpMap };
}

/**
 * Closed volumetric petal: origin at the basal claw, +Y toward the tip,
 * -Z the concave inner face that looks toward the centre.
 */
function petalGeometry(T: any, spec: Slot, index: number) {
  const segU = 26;
  const segV = 38;
  const length = 1.64 * spec.lengthScale;
  const maxHalf = 0.53 * spec.widthScale;
  const baseThick = 0.032;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const cBase = new T.Color('#EFEBD9');
  const cCream = new T.Color('#FCF7F0');
  const cMid = new T.Color('#F8DDE6');
  const cTip = new T.Color('#E59AB1');
  const cEdge = new T.Color('#EBA8BC');
  const point = (u: number, v: number, inner: boolean) => {
    const s = u * 2 - 1;
    const a = Math.abs(s);
    const env =
      0.15 * (1 - v) * Math.exp(-v * 3.5) +
      Math.pow(Math.sin(v * Math.PI), 0.75) * (0.89 + 0.18 * Math.sin(v * Math.PI * 0.85));
    const asym = spec.asymmetry * Math.sin(v * Math.PI) * (1 - a * 0.4);
    const x = (s * env + asym) * maxHalf;
    const lengthCup = 0.25 * Math.sin(v * Math.PI * 0.88) - 0.065 * Math.pow(v, 2.6);
    const cupEnv = Math.sin(v * Math.PI) * (0.36 + 0.64 * (1 - v * 0.3));
    const transCup = -spec.cupDepth * (1 - s * s) * cupEnv;
    const rim = 0.011 * Math.pow(a, 1.8) * Math.sin(v * Math.PI * 2.2 + index * 1.1);
    const vein = 0.0038 * Math.cos(s * Math.PI * 7.0) * Math.sin(v * Math.PI);
    const midrib = 1.0 - 0.72 * Math.pow(a, 1.35);
    const tipTaper = Math.sin(Math.min(1, (1 - v) * 2.2) * (Math.PI / 2));
    const thick =
      baseThick * (0.28 + 0.72 * midrib) * (0.22 + 0.78 * tipTaper) * (1 - 0.86 * Math.pow(a, 3.6));
    const z = lengthCup + transCup + rim + vein + (inner ? -thick * 0.5 : thick * 0.5);
    const y = v * length - 0.04 * Math.pow(v, 2.2);
    const c = new T.Color();
    if (v < 0.18) c.lerpColors(cBase, cCream, v / 0.18);
    else if (v < 0.58) c.lerpColors(cCream, cMid, (v - 0.18) / 0.4);
    else c.lerpColors(cMid, cTip, (v - 0.58) / 0.42);
    c.lerp(cEdge, Math.pow(a, 2.4) * Math.pow(v, 0.7) * 0.36);
    return [x, y, z, c.r, c.g, c.b];
  };
  for (const inner of [true, false])
    for (let iv = 0; iv <= segV; iv++)
      for (let iu = 0; iu <= segU; iu++) {
        const p = point(iu / segU, iv / segV, inner);
        pos.push(p[0], p[1], p[2]);
        col.push(p[3], p[4], p[5]);
        uv.push(iu / segU, iv / segV);
      }
  const st = segU + 1;
  const off = (segV + 1) * st;
  for (let iv = 0; iv < segV; iv++)
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * st + iu;
      const c = (iv + 1) * st + iu;
      idx.push(a, a + 1, c + 1, a, c + 1, c);
      idx.push(off + a, off + c + 1, off + a + 1, off + a, off + c, off + c + 1);
    }
  // stitch the side margins so the petal has real thickness
  for (let iv = 0; iv < segV; iv++) {
    const l0 = iv * st;
    const l1 = (iv + 1) * st;
    idx.push(l0, l1, off + l1, l0, off + l1, off + l0);
    const r0 = l0 + segU;
    const r1 = l1 + segU;
    idx.push(r0, off + r1, r1, r0, off + r0, off + r1);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Where a petal sits on the receptacle rim, tilted radially outward from +Y. */
function socket(T: any, spec: Slot, extraTilt = 0) {
  const position = new T.Vector3(
    Math.sin(spec.azimuth) * spec.baseRadius,
    spec.baseY,
    Math.cos(spec.azimuth) * spec.baseRadius,
  );
  const quaternion = new T.Quaternion().setFromEuler(
    new T.Euler(spec.baseTilt + extraTilt, spec.azimuth, spec.twist, 'YXZ'),
  );
  return { position, quaternion };
}

// Small tween engine driven by the render loop (no animation library needed).
type Ease = (t: number) => number;
const E: Record<string, Ease> = {
  p2io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  p2in: (t) => t * t,
  expoIn: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    const a = 1.15;
    const p = 0.45;
    const s = (p / (2 * Math.PI)) * Math.asin(1 / a);
    return a * Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1;
  },
};

/**
 * Search progress as an organic lotus. Each honest lookup step sends one petal flying in
 * along a curved path to its socket on the turning flower. When products are found the
 * camera aligns over the bloom and dives into its centre, handing off to the results.
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
  const foundRef = useRef(found);
  foundRef.current = found;

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
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        r.setClearColor(0x000000, 0);
        r.outputEncoding = T.sRGBEncoding;
        r.toneMapping = T.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.07;
        // the lotus was lit in physical light units; r149 needs this switched on to match
        r.physicallyCorrectLights = true;
        r.shadowMap.enabled = true;
        r.shadowMap.type = T.PCFSoftShadowMap;
        const scene = new T.Scene();
        const cam = new T.PerspectiveCamera(35, 1, 0.08, 60);
        // pulled back from the original framing so the full bloom fits a wide, short panel
        const DIST = 5.4;
        const look = new T.Vector3(0, 0.6, 0);
        cam.position.set(0, 2.6, DIST);

        // soft studio botanical light
        scene.add(new T.AmbientLight(0xfff9f5, 1.48));
        const hemi = new T.HemisphereLight(0xfffdf9, 0xe6dec8, 0.95);
        hemi.position.set(0, 6, 0);
        scene.add(hemi);
        const key = new T.DirectionalLight(0xfff7f0, 1.85);
        key.position.set(3.2, 5.8, 4.2);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.bias = -0.0005;
        scene.add(key);
        const rim = new T.DirectionalLight(0xfde8ef, 1.18);
        rim.position.set(-3.5, 3.2, -3.0);
        scene.add(rim);
        const under = new T.DirectionalLight(0xe8f0e2, 0.58);
        under.position.set(0, -3.0, 2.0);
        scene.add(under);
        const sweep = new T.PointLight(0xfff0f5, 0, 6);
        sweep.position.set(-2.2, 1.8, 1.5);
        scene.add(sweep);

        // sage-green stem, slightly swollen just under the flower
        const curve = new T.CatmullRomCurve3([
          new T.Vector3(0.035, -3.4, -0.025),
          new T.Vector3(0.018, -2.1, 0.015),
          new T.Vector3(-0.012, -0.9, 0.01),
          new T.Vector3(0.0, 0.34, 0.0),
        ]);
        const stemGeo = new T.TubeGeometry(curve, 64, 0.066, 24, false);
        const sp = stemGeo.getAttribute('position');
        const sc = new Float32Array(sp.count * 3);
        const lo = new T.Color('#65805A');
        const hi = new T.Color('#829E75');
        for (let i = 0; i < sp.count; i++) {
          const t = Math.min(1, Math.max(0, (sp.getY(i) + 3.4) / 3.74));
          const k = 1.08 - 0.22 * t + 0.16 * Math.exp(-Math.pow((1 - t) * 7, 2));
          const c0 = curve.getPointAt(t);
          sp.setX(i, c0.x + (sp.getX(i) - c0.x) * k);
          sp.setZ(i, c0.z + (sp.getZ(i) - c0.z) * k);
          const c = new T.Color().lerpColors(lo, hi, t);
          sc[i * 3] = c.r;
          sc[i * 3 + 1] = c.g;
          sc[i * 3 + 2] = c.b;
        }
        stemGeo.setAttribute('color', new T.BufferAttribute(sc, 3));
        stemGeo.computeVertexNormals();
        const stem = new T.Mesh(
          stemGeo,
          new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 }),
        );
        stem.castShadow = true;
        stem.receiveShadow = true;
        scene.add(stem);

        // turning flower head with a pale-yellow seed-pod receptacle
        const head = new T.Group();
        head.position.set(0, 0.36, 0);
        scene.add(head);
        const calyx = new T.Mesh(
          new T.CylinderGeometry(0.21, 0.08, 0.11, 28),
          new T.MeshStandardMaterial({ color: 0x7e9a71, roughness: 0.68, metalness: 0.02 }),
        );
        calyx.position.y = -0.04;
        head.add(calyx);
        const podGeo = new T.CylinderGeometry(0.22, 0.135, 0.155, 32, 4);
        const pp = podGeo.getAttribute('position');
        for (let i = 0; i < pp.count; i++) {
          const y = pp.getY(i);
          if (y > 0.045)
            pp.setY(i, y + 0.026 * (1 - Math.pow(Math.hypot(pp.getX(i), pp.getZ(i)) / 0.23, 2)));
        }
        podGeo.computeVertexNormals();
        const pod = new T.Mesh(
          podGeo,
          new T.MeshStandardMaterial({ color: 0xecd98b, roughness: 0.56, metalness: 0.02 }),
        );
        pod.position.y = 0.04;
        head.add(pod);
        const carpelGeo = new T.SphereGeometry(0.016, 12, 10);
        const carpelMat = new T.MeshStandardMaterial({ color: 0xcbb96a, roughness: 0.55 });
        [
          [0, 0],
          [0.08, 0],
          [-0.08, 0],
          [0, 0.08],
          [0, -0.08],
          [0.058, 0.058],
          [-0.058, 0.058],
          [0.058, -0.058],
          [-0.058, -0.058],
        ].forEach(([x, z]) => {
          const m = new T.Mesh(carpelGeo, carpelMat);
          m.position.set(x, 0.125, z);
          m.scale.set(1, 0.55, 1);
          head.add(m);
        });
        const filGeo = new T.CylinderGeometry(0.004, 0.0055, 0.15, 6);
        const antGeo = new T.SphereGeometry(0.01, 8, 8);
        antGeo.scale(0.8, 1.75, 0.8);
        const filMat = new T.MeshStandardMaterial({ color: 0xf3df8d, roughness: 0.5 });
        const antMat = new T.MeshStandardMaterial({ color: 0xe5c267, roughness: 0.45 });
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          const g = new T.Group();
          g.position.set(Math.sin(a) * 0.195, 0.058, Math.cos(a) * 0.195);
          g.rotation.set(0.26 + (i % 2) * 0.07, a, 0, 'YXZ');
          const f = new T.Mesh(filGeo, filMat);
          f.position.y = 0.075;
          g.add(f);
          const an = new T.Mesh(antGeo, antMat);
          an.position.y = 0.155;
          g.add(an);
          head.add(g);
        }

        const { map, bumpMap } = petalTextures(T);
        const petalMat = new T.MeshPhysicalMaterial({
          map,
          bumpMap,
          bumpScale: 0.008,
          vertexColors: true,
          roughness: 0.44,
          metalness: 0.01,
          transmission: reduce ? 0 : 0.15,
          thickness: 0.18,
          ior: 1.38,
          sheen: 0.35,
          sheenRoughness: 0.65,
          sheenColor: new T.Color('#FFF5F8'),
          clearcoat: 0.05,
          clearcoatRoughness: 0.6,
          side: T.DoubleSide,
        });
        const petalGeos = SLOTS.map((s, i) => petalGeometry(T, s, i));

        // tween engine
        type Tw = {
          o: any;
          from: Record<string, number>;
          to: Record<string, number>;
          t0: number;
          d: number;
          e: Ease;
          up?: () => void;
          res: () => void;
        };
        let tweens: Tw[] = [];
        const tween = (
          o: any,
          to: Record<string, number>,
          ms: number,
          e: Ease,
          up?: () => void,
          delay = 0,
        ) =>
          new Promise<void>((res) => {
            const start = () => {
              const from: Record<string, number> = {};
              Object.keys(to).forEach((k) => (from[k] = o[k]));
              tweens.push({ o, from, to, t0: performance.now(), d: ms, e, up, res });
            };
            if (delay) setTimeout(start, delay);
            else start();
          });
        const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

        // petal queue: one in flight at a time, each locks onto its moving socket
        let speed = 0.38;
        let next = 0;
        const queue: number[] = [];
        let flying: {
          slot: number;
          mesh: any;
          t0: number;
          from: any;
          fromQ: any;
          ctrl: any;
        } | null = null;
        const attached: any[] = [];
        let finishCb: (() => void) | null = null;
        let finishing = false;
        let diving = false;
        const place = (slot: number) => {
          const m = new T.Mesh(petalGeos[slot], petalMat);
          m.castShadow = true;
          m.receiveShadow = true;
          const s0 = socket(T, SLOTS[slot]);
          m.position.copy(s0.position);
          m.quaternion.copy(s0.quaternion);
          head.add(m);
          attached.push(m);
        };
        api.current = {
          add: () => {
            if (next >= SLOTS.length) return;
            if (reduce) place(next++);
            else queue.push(next++);
          },
          finish: (cb) => {
            finishCb = cb;
          },
        };
        queued.current.splice(0).forEach((tone) => api.current?.add(tone));

        const dive = async (cb: () => void) => {
          diving = true;
          // speed the bloom up and sweep a soft light across it
          const sp0 = { s: speed };
          tween(sp0, { s: 0.76 }, 750, E.p2io, () => (speed = sp0.s));
          sweep.position.set(-2.4, 1.9, 1.8);
          tween(sweep, { intensity: 2.4 }, 550, E.p2io).then(() =>
            tween(sweep, { intensity: 0 }, 550, E.p2io),
          );
          tween(sweep.position, { x: 2.4 }, 1100, E.p2io);
          await wait(1050);
          await Promise.all([
            tween(cam.position, { x: 0, y: 3.15, z: 1.42 }, 680, E.p2io),
            tween(look, { x: 0, y: 0.42, z: 0 }, 680, E.p2io),
          ]);
          await Promise.all([
            tween(cam.position, { x: 0, y: 1.72, z: 0.18 }, 550, E.p2in),
            tween(look, { x: 0, y: 0.36, z: 0 }, 550, E.p2in),
          ]);
          // dive into the seed pod; the white handoff starts part-way down
          setTimeout(cb, 220);
          await Promise.all([
            tween(cam.position, { x: 0, y: 0.64, z: 0.01 }, 520, E.expoIn),
            tween(cam, { fov: 54 }, 520, E.expoIn, () => cam.updateProjectionMatrix()),
          ]);
        };

        const resize = () => {
          const b = F.getBoundingClientRect();
          r.setSize(b.width, b.height, false);
          cam.aspect = b.width / Math.max(1, b.height);
          cam.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(F);
        resize();

        // drag to look around the bloom while it grows
        let drag: { x: number; y: number } | null = null;
        let az = 0;
        let el = 2.6;
        const down = (e: PointerEvent) => {
          if (!diving) drag = { x: e.clientX, y: e.clientY };
        };
        const move = (e: PointerEvent) => {
          if (!drag || diving) return;
          az -= (e.clientX - drag.x) * 0.0055;
          el = Math.min(3.65, Math.max(1.15, el + (e.clientY - drag.y) * 0.008));
          drag = { x: e.clientX, y: e.clientY };
          const hr = Math.sqrt(Math.max(1.2, DIST * DIST - el * el * 0.35));
          cam.position.set(Math.sin(az) * hr, el, Math.cos(az) * hr);
        };
        const up = () => (drag = null);
        cv.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);

        let raf = 0;
        let last = performance.now();
        const frameFn = (now: number) => {
          raf = requestAnimationFrame(frameFn);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          tweens = tweens.filter((tw) => {
            const p = Math.min(1, (now - tw.t0) / tw.d);
            const k = tw.e(p);
            Object.keys(tw.to).forEach((key) => {
              tw.o[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
            });
            tw.up?.();
            if (p >= 1) tw.res();
            return p < 1;
          });
          if (!reduce) head.rotation.y += speed * dt;
          head.updateMatrixWorld(true);

          if (!flying && queue.length) {
            const slot = queue.shift() as number;
            const spec = SLOTS[slot];
            const mesh = new T.Mesh(petalGeos[slot], petalMat);
            mesh.castShadow = true;
            const target = spec.azimuth + head.rotation.y + speed * 0.82;
            const sa = target + spec.spawnAzimuthOffset;
            const sr = 6.3 + (slot % 3) * 0.45;
            const from = new T.Vector3(Math.sin(sa) * sr, spec.spawnElevation, Math.cos(sa) * sr);
            const ma = target + spec.spawnAzimuthOffset * 0.35;
            const ctrl = new T.Vector3(
              Math.sin(ma) * 2.35,
              1.95 + (slot % 2) * 0.35,
              Math.cos(ma) * 2.35,
            );
            const fromQ = new T.Quaternion().setFromEuler(
              new T.Euler(spec.baseTilt + 0.85, sa + 0.6, spec.twist + 0.45, 'YXZ'),
            );
            mesh.position.copy(from);
            mesh.quaternion.copy(fromQ);
            scene.add(mesh);
            flying = { slot, mesh, t0: now, from, fromQ, ctrl };
          }
          if (flying) {
            const f = flying;
            const raw = Math.min(1, (now - f.t0) / 820);
            const k = 1 - Math.pow(1 - raw, 3.4);
            const s1 = socket(T, SLOTS[f.slot], 0.11);
            const tp = s1.position.clone().applyMatrix4(head.matrixWorld);
            const hq = new T.Quaternion().setFromRotationMatrix(head.matrixWorld);
            const tq = hq.clone().multiply(s1.quaternion);
            const inv = 1 - k;
            f.mesh.position
              .set(0, 0, 0)
              .addScaledVector(f.from, inv * inv)
              .addScaledVector(f.ctrl, 2 * inv * k)
              .addScaledVector(tp, k * k);
            f.mesh.quaternion.copy(f.fromQ).slerp(tq, k);
            if (raw >= 1) {
              // reparent onto the turning head, then let the petal spring into place
              scene.remove(f.mesh);
              head.add(f.mesh);
              const s0 = socket(T, SLOTS[f.slot]);
              f.mesh.position.copy(s0.position);
              const spring = { t: 0.11 };
              tween(spring, { t: 0 }, 520, E.elastic, () =>
                f.mesh.quaternion.copy(socket(T, SLOTS[f.slot], spring.t).quaternion),
              );
              attached.push(f.mesh);
              flying = null;
            }
          }
          // completion waits until every queued petal has landed
          if (finishCb && !finishing && !flying && !queue.length) {
            finishing = true;
            const cb = finishCb;
            if (reduce || !foundRef.current) setTimeout(cb, reduce ? 300 : 900);
            else void dive(cb);
          }
          cam.lookAt(look);
          r.render(scene, cam);
        };
        raf = requestAnimationFrame(frameFn);
        F.dataset.ready = 'true';
        stop = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          cv.removeEventListener('pointerdown', down);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          petalGeos.forEach((g: any) => g.dispose());
          map.dispose();
          bumpMap.dispose();
          petalMat.dispose();
          stemGeo.dispose();
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
          title: 'Looking for recorded matches',
          detail: 'cached checks may be reused',
          tone: 'seen',
        });
      }, 600),
    );
    const iv = setInterval(() => {
      if (waited.current >= MAX_WAIT_PETALS || finished.current) return;
      waited.current++;
      push({
        title: 'Still checking retailer pages',
        detail: 'waiting for the search service; petals are not a store count',
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
    const fallback = setTimeout(() => doneRef.current(), 9000);
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
      <button className="v2-fl-skip" onClick={() => doneRef.current()}>
        {busy ? 'Show recorded results' : 'Show results'}
      </button>
      <div className={flash ? 'v2-flash on' : 'v2-flash'} aria-hidden="true" />
    </section>
  );
}
