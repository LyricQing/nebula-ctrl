/**
 * index.html 回归校验（CI 门禁）
 *
 * 做法：从 index.html 里抽出那段 <script type="module">，用 DOM 桩在 Node 里真实执行它，
 * 然后调用模块内的函数做断言——不是静态读代码，而是真的跑一遍粒子形态生成与手势分类逻辑。
 *
 * 覆盖：形态生成（5 种，无 NaN 且尺寸合理）、手势分类（含两种真实捏合姿态）、
 *      One-Euro 滤波收敛与 NaN 防护、缓动单调性、以及着色器 uniform/attribute
 *      与 JS 绑定表的一致性交叉检查（能抓到拼错的 uniform 名，这类错误在浏览器里只会静默变色）。
 *
 * 仅依赖 Node 内置模块。用法：node tools/verify.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 必须用 fileURLToPath：本机路径含中文，url.pathname 会百分号编码，且 Windows 盘符也需还原
const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');

const results = [];
const ok = (name, cond, extra) =>
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === undefined ? '' : '  -> ' + extra}`);

/* ---------------- 静态交叉检查：GLSL 声明 vs JS 绑定 ---------------- */
const m = src.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL  未找到 <script type="module"> 区块'); process.exit(1); }
const moduleSrc = m[1];

const declared = new Set();
for (const r of moduleSrc.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)) declared.add(r[1]);

const uniformsBlock = moduleSrc.match(/uniforms = \{([\s\S]*?)\n  \};/);
const bound = new Set();
if (uniformsBlock) for (const r of uniformsBlock[1].matchAll(/(\w+)\s*:\s*\{/g)) bound.add(r[1]);

ok('着色器 uniform 声明与绑定表均非空', declared.size > 20 && bound.size > 20, `声明 ${declared.size} / 绑定 ${bound.size}`);
const unbound = [...declared].filter((n) => !bound.has(n));
const extraBound = [...bound].filter((n) => !declared.has(n));
ok('GLSL 里每个 uniform 都有 JS 绑定', unbound.length === 0, unbound.join(',') || 'none');
ok('JS 绑定表里没有多余的 uniform', extraBound.length === 0, extraBound.join(',') || 'none');

const glslAttrs = [...moduleSrc.matchAll(/^\s*attribute\s+\w+\s+(\w+)\s*;/gm)].map((r) => r[1]).filter((n) => n !== 'position');
const jsAttrs = [...moduleSrc.matchAll(/setAttribute\('(\w+)'/g)].map((r) => r[1]);
ok('着色器 attribute 都在 geometry 上绑定', glslAttrs.length === 5 && glslAttrs.every((n) => jsAttrs.includes(n)), glslAttrs.join(','));
ok('没有多余的 geometry 属性', jsAttrs.filter((n) => n !== 'position').every((n) => glslAttrs.includes(n)), jsAttrs.join(','));

/* ---------------- DOM 桩：让模块能在 Node 里顶层执行 ---------------- */
const fake = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {} },
  textContent: '', innerHTML: '', hidden: false, disabled: false,
  addEventListener() {},
  getContext() { return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} }; },
  width: 0, height: 0, readyState: 0, currentTime: 0, play: async () => {}, srcObject: null,
});
const putGlobal = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); } catch { /* 只读则跳过 */ } };
putGlobal('document', { getElementById: () => fake(), createElement: () => fake(), addEventListener() {} });
putGlobal('window', { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1, addEventListener() {}, isSecureContext: true, location: { protocol: 'https:' } });
putGlobal('location', { protocol: 'https:' });
putGlobal('navigator', { mediaDevices: {} });
putGlobal('requestAnimationFrame', () => 0);
globalThis.__ok = ok;

/* ---------------- 追加自检代码，在模块作用域内执行 ---------------- */
const tmpFile = path.join(os.tmpdir(), 'nebula-verify-module.mjs');
fs.writeFileSync(tmpFile, moduleSrc + `

{
  const finite = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false; return true; };
  const radiusOf = (arr) => { let mx = 0; for (let i = 0; i < arr.length; i += 3) mx = Math.max(mx, Math.hypot(arr[i], arr[i + 1], arr[i + 2])); return mx; };
  const N = 4000;
  for (const s of SHAPES) {
    const a = s.gen(N, mulberry32(4321));
    __ok('形态 ' + s.name + ' 全为有限值', finite(a));
    const r = radiusOf(a);
    __ok('形态 ' + s.name + ' 尺寸在可视范围', r > 10 && r < 90, '半径 ' + r.toFixed(1));
  }
  __ok('开场散布全为有限值', finite(shapeScatter(N, mulberry32(9))));

  /* 合成手部关键点：验证分类阈值内部一致 */
  const hand = (cfg) => {
    const p = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
    const set = (i, x, y) => { p[i] = { x, y, z: 0 }; };
    set(0, 0.50, 0.80);
    set(1, 0.45, 0.74); set(2, 0.41, 0.70); set(3, 0.38, 0.66); set(4, 0.34, 0.62);
    set(5, 0.47, 0.60); set(6, 0.465, 0.53); set(7, 0.462, 0.485); set(8, 0.46, 0.44);
    set(9, 0.50, 0.595); set(10, 0.50, 0.52); set(11, 0.50, 0.47); set(12, 0.50, 0.42);
    set(13, 0.53, 0.60); set(14, 0.535, 0.53); set(15, 0.538, 0.485); set(16, 0.54, 0.445);
    set(17, 0.56, 0.62); set(18, 0.565, 0.56); set(19, 0.568, 0.525); set(20, 0.57, 0.49);
    if (cfg === 'fist') {
      set(4, 0.44, 0.66); set(8, 0.48, 0.655); set(12, 0.50, 0.65); set(16, 0.525, 0.66); set(20, 0.55, 0.675);
    } else if (cfg === 'pinch') {            // 食指基本伸展，拇指指尖相触
      set(4, 0.42, 0.45); set(8, 0.44, 0.47); set(12, 0.50, 0.65); set(16, 0.525, 0.66); set(20, 0.55, 0.675);
    } else if (cfg === 'pinchBent') {        // 食指半屈（真实捏合常见姿态），指尖仍在掌心之外
      set(4, 0.43, 0.54); set(8, 0.45, 0.53); set(12, 0.50, 0.65); set(16, 0.525, 0.66); set(20, 0.55, 0.675);
    } else if (cfg === 'point') {
      set(4, 0.46, 0.66); set(12, 0.50, 0.65); set(16, 0.525, 0.66); set(20, 0.55, 0.675);
    } else if (cfg === 'victory') {
      set(4, 0.45, 0.68); set(16, 0.525, 0.66); set(20, 0.55, 0.675);
    }
    return p;
  };
  for (const [cfg, expect] of [['open','open'], ['fist','fist'], ['pinch','pinch'], ['pinchBent','pinch'], ['point','point'], ['victory','victory']]) {
    const f = classify(hand(cfg));
    __ok('手势分类 ' + cfg + ' -> ' + expect, f.gesture === expect,
      '实际 ' + f.gesture + ' nFour=' + f.nFour + ' pinchRatio=' + f.pinchRatio.toFixed(2) + ' tuck=' + f.tuck.toFixed(2) + ' indexOut=' + f.indexOut.toFixed(2));
  }
  __ok('张掌 pinchAmt 接近 0', classify(hand('open')).pinchAmt < 0.2, classify(hand('open')).pinchAmt.toFixed(3));
  __ok('捏合 pinchAmt 接近 1', classify(hand('pinch')).pinchAmt > 0.9, classify(hand('pinch')).pinchAmt.toFixed(3));

  const flat = hand('open');
  __ok('掌面倾角有限且在 ±1.1 内', Number.isFinite(rollOf(flat)) && Math.abs(rollOf(flat)) <= 1.1, rollOf(flat).toFixed(4));
  const tilt = hand('open'); tilt[17] = { x: 0.56, y: 0.72, z: 0 };
  __ok('倾斜手掌产生非零 roll', Math.abs(rollOf(tilt)) > 0.15, rollOf(tilt).toFixed(4));

  const f1 = new OneEuro(1.0, 0.007);
  let outp = 0, bad = 0;
  for (let i = 0; i < 300; i++) {
    outp = f1.filter((i < 150 ? 0 : 1) + (i % 3 === 0 ? 0.01 : -0.01), i / 60);
    if (!Number.isFinite(outp)) bad++;
  }
  __ok('One-Euro 稳定收敛到 1', bad === 0 && Math.abs(outp - 1) < 0.02, 'out=' + outp.toFixed(4));
  __ok('One-Euro 对 NaN 输入不返回 NaN', Number.isFinite(new OneEuro().filter(NaN, 0.1)));

  __ok('easeCubic 单调 0→1', easeCubic(0) === 0 && Math.abs(easeCubic(1) - 1) < 1e-9 && easeCubic(0.75) > easeCubic(0.5));
  __ok('clamp / remap 边界正确', clamp(5, 0, 1) === 1 && remap(0.5, 0, 1, 0, 10) === 5);
  __ok('关键常量齐全', CFG.COUNT >= 15000 && CFG.COUNT_LOW < CFG.COUNT && SHAPES.length === 5 && THEMES.length === 3);
  __ok('初始状态无 NaN', Number.isFinite(state.spread) && Number.isFinite(state.zoom) && Number.isFinite(state.swirl));
  __ok('双手槽位与滤波器已初始化', state.hands.length === 2 && typeof state.hands[0].fx.filter === 'function');
  __ok('同域模型与镜像回退配置就位',
    CFG.MODEL_LOCAL === './hand_landmarker.task' && CFG.VISION_URLS.length === 2 && CFG.WASM_ROOTS.length === 2);
  __ok('着色器文本不含反引号', !VERT.includes(String.fromCharCode(96)) && !FRAG.includes(String.fromCharCode(96)));
}
`);

await import(pathToFileURL(tmpFile).href + '?t=' + Date.now());
fs.unlinkSync(tmpFile);

for (const r of results) console.log(r);
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n汇总: ${results.length - failed.length} 通过 / ${failed.length} 失败`);
if (failed.length) process.exit(1);
