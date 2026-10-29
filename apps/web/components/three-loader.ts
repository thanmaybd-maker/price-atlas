// Loads the vendored Three.js build once, on demand, so the 3D pieces never block hydration.
/* eslint-disable @typescript-eslint/no-explicit-any */
let pending: Promise<any> | null = null;

export function loadThree(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  const w = window as any;
  if (w.THREE) return Promise.resolve(w.THREE);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/three-r149.min.js';
    s.async = true;
    s.onload = () => (w.THREE ? resolve(w.THREE) : reject(new Error('Three.js missing')));
    s.onerror = () => {
      pending = null;
      reject(new Error('Unable to load Three.js'));
    };
    document.head.appendChild(s);
  });
  return pending;
}

let loaderPending: Promise<any> | null = null;
const models = new Map<string, Promise<any>>();

/** Loads a Blender-exported .glb once and resolves its scene graph (callers clone what they use). */
export function loadModel(url: string): Promise<any> {
  if (models.has(url)) return models.get(url) as Promise<any>;
  const p = loadThree()
    .then((T: any) => {
      if (T.GLTFLoader) return T;
      if (!loaderPending)
        loaderPending = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = '/vendor/three-gltf-loader-r147.js';
          s.async = true;
          s.onload = () => (T.GLTFLoader ? resolve(T) : reject(new Error('GLTFLoader missing')));
          s.onerror = () => {
            loaderPending = null;
            reject(new Error('Unable to load GLTFLoader'));
          };
          document.head.appendChild(s);
        });
      return loaderPending;
    })
    .then(
      (T: any) =>
        new Promise((resolve, reject) => new T.GLTFLoader().load(url, resolve, undefined, reject)),
    );
  p.catch(() => models.delete(url));
  models.set(url, p);
  return p;
}

export function canWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Reads a CSS custom property from an element and converts it to linear RGB 0..1. */
export function cssColor(el: Element, name: string): [number, number, number] {
  const v = getComputedStyle(el).getPropertyValue(name).trim() || 'gray';
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const x = c.getContext('2d');
  if (!x) return [0.5, 0.5, 0.5];
  x.fillStyle = v;
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

export function reducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
