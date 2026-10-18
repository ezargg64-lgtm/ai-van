// ── Procedural texture smoke test ────────────────────────────────────────────
// Every texture in the van is drawn with the 2D canvas API at mount. A typo in
// that code (a method that does not exist, a gradient used before it is built)
// throws inside a useMemo and takes the whole scene down with it — so this test
// installs a validating fake canvas and draws all of them for real.
//
//   npm run test:textures

const CTX_METHODS = new Set([
  'fillRect',
  'strokeRect',
  'clearRect',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'bezierCurveTo',
  'quadraticCurveTo',
  'arc',
  'arcTo',
  'ellipse',
  'rect',
  'fill',
  'stroke',
  'clip',
  'save',
  'restore',
  'translate',
  'rotate',
  'scale',
  'setTransform',
  'createLinearGradient',
  'createRadialGradient',
  'createPattern',
  'fillText',
  'strokeText',
  'measureText',
  'drawImage',
  'putImageData',
  'getImageData',
]);

const CTX_PROPS = new Set([
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'lineCap',
  'lineJoin',
  'globalAlpha',
  'globalCompositeOperation',
  'font',
  'textAlign',
  'textBaseline',
  'shadowBlur',
  'shadowColor',
  'miterLimit',
  'imageSmoothingEnabled',
]);

type Call = { name: string; args: unknown[] };

const calls: Call[] = [];

function makeContext() {
  const state: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  const gradient = {
    addColorStop: (offset: number, color: string) => {
      if (typeof offset !== 'number' || offset < 0 || offset > 1) {
        throw new Error(`addColorStop offset out of range: ${offset}`);
      }
      if (typeof color !== 'string' || !color.length) throw new Error(`addColorStop colour invalid: ${color}`);
      calls.push({ name: 'gradient.addColorStop', args: [offset, color] });
    },
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop in state) return state[prop];
      if (prop === 'canvas') return { width: 1, height: 1 };
      if (CTX_METHODS.has(prop)) {
        return (...args: unknown[]) => {
          calls.push({ name: prop, args });
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
          if (prop === 'measureText') return { width: 10 };
          if (prop === 'getImageData') return { data: new Uint8ClampedArray(4) };
          return undefined;
        };
      }
      if (CTX_PROPS.has(prop)) return state[prop];
      throw new Error(`canvas 2d context has no member "${String(prop)}"`);
    },
    set(_target, prop: string, value) {
      if (!CTX_PROPS.has(prop)) throw new Error(`canvas 2d context has no settable member "${String(prop)}"`);
      if ((prop === 'fillStyle' || prop === 'strokeStyle') && typeof value === 'string') {
        if (!/^(#|rgb|hsl|rgba|hsla|\w+$)/i.test(value)) throw new Error(`suspect colour: ${value}`);
      }
      if (prop === 'globalAlpha' && (typeof value !== 'number' || value < 0 || value > 1)) {
        throw new Error(`globalAlpha out of range: ${value}`);
      }
      state[prop] = value;
      return true;
    },
  };
  return new Proxy(state, handler);
}

const madeCanvases: Array<{ width: number; height: number }> = [];

(globalThis as any).document = {
  createElement(tag: string) {
    if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
    const canvas: any = {
      width: 300,
      height: 150,
      style: {},
      getContext(kind: string) {
        if (kind !== '2d') throw new Error(`unexpected context kind ${kind}`);
        return makeContext();
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    madeCanvases.push(canvas);
    return canvas;
  },
};

// three only needs the image object for an offscreen texture; its WebGL parts are
// never touched here.
const { floorTexture, rugTexture, cushionTexture, panoramaTexture, gpsTexture } = await import('../src/scene/textures');

let failures = 0;
let checks = 0;
function ok(cond: boolean, label: string, detail = '') {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  ✓ ${label}`);
  }
}

function draw(label: string, fn: () => unknown, minCalls: number) {
  const before = calls.length;
  let result: unknown = null;
  try {
    result = fn();
  } catch (err) {
    ok(false, `${label} draws without throwing`, (err as Error).message);
    return null;
  }
  const made = calls.length - before;
  ok(Boolean(result), `${label} returns a texture`);
  ok(made >= minCalls, `${label} actually drew something`, `${made} canvas calls`);
  return result as any;
}

console.log('\n🚐 DEV VAN LIFE — procedural texture smoke test\n');

draw('floor planks', floorTexture, 40);
draw('rug', rugTexture, 10);
draw('cushion weave', cushionTexture, 4);
draw('gps screen', gpsTexture, 10);
const day = draw('day panorama', () => panoramaTexture(true), 120);
const night = draw('night panorama', () => panoramaTexture(false), 300);

console.log('\nconfig checks');
for (const [label, t] of [
  ['day panorama', day],
  ['night panorama', night],
] as const) {
  if (!t) continue;
  ok(t.image.width === 4096 && t.image.height === 512, `${label} is 4096x512`, `${t.image.width}x${t.image.height}`);
  ok(t.wrapS === 1000, `${label} wraps horizontally (RepeatWrapping)`, String(t.wrapS));
  ok(Boolean(t.colorSpace), `${label} has a colour space set`);
}

console.log('\ncaching (the plan asks for generate-once)');
const again = floorTexture();
ok(again === floorTexture(), 'texture functions are memoised per key');
ok(madeCanvases.length >= 6 && madeCanvases.length <= 8, 'no canvas is drawn twice', `${madeCanvases.length} canvases made`);

console.log('\nseam safety: the wide shapes must be drawn on both edges');
{
  // conifers/clouds are drawn at x and again at x±width; without that the panorama
  // would show a hard seam every half turn.
  const wrapCalls = calls.filter((c) => c.name === 'moveTo' || c.name === 'lineTo').length;
  ok(wrapCalls > 200, 'panorama silhouette work is substantial', `${wrapCalls} path segments`);
  const gradients = calls.filter((c) => c.name === 'createLinearGradient' || c.name === 'createRadialGradient').length;
  ok(gradients >= 4, 'sky/sun/moon gradients were built', `${gradients}`);
}

console.log(
  `\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed` +
    (failures ? ` — ${failures} FAILED` : ' — every texture draws\n'),
);
process.exit(failures === 0 ? 0 : 1);
