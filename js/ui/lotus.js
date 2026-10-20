// The neon-pink lotus menu.
//
// The flower's centre sits just past the LEFT edge of its panel, so only the
// right half shows (a semicircle). Each option sits on the tip of a petal.
// The selected petal always points straight right (angle 0). Rotating =
// changing which petal is at angle 0; we animate the angle each frame.
//
//   ArrowUp / ArrowLeft    previous option
//   ArrowDown / ArrowRight next option
//   mouse wheel, click a petal tip, Enter = also works

const NS = 'http://www.w3.org/2000/svg';
const CX = -70;          // centre x (negative = off the left edge)
const PETAL = 345;       // petal length (option petals)
const NODE_R = 368;      // where the option circles sit
const FILL = 7;          // empty petals before the first and after the last option, so the flower always looks full
const STEP = 24;         // degrees between petals
const rad = (deg) => (deg * Math.PI) / 180;

// Small line icons drawn in a 24x24 box (original drawings, not Google logos)
export const ICONS = {
  all: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  classroom: 'M3 9l9-5 9 5-9 5zM7 11.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5M21 9v6',
  group: 'M4 4h8l8 8-8 8-8-8zM8.5 8.5h.01',
  history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
  todo: 'M5 4h14v16H5zM8.5 12l2.5 2.5 4.5-5',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
};

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function petalPath(len, w) {
  return `M0,0 C${len * 0.3},${-w} ${len * 0.78},${-w * 0.75} ${len},0 C${len * 0.78},${w * 0.75} ${len * 0.3},${w} 0,0Z`;
}

export function createLotus(svg, { onSelect } = {}) {
  // Fit the picture to the panel: tall panel = show more petals, short (phones) = zoom in
  const fit = () => {
    const { width, height } = svg.getBoundingClientRect();
    const h = width ? Math.max(440, Math.min(840, (560 * height) / width)) : 840;
    svg.setAttribute('viewBox', `0 ${-h / 2} 560 ${h}`);
  };
  fit();
  new ResizeObserver(fit).observe(svg);
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'listbox');
  svg.setAttribute('aria-label', 'Choose what to show. Use the arrow keys.');

  // glow filters + gradient
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowStrong" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="petalFill" x1="0" x2="1">
      <stop offset="0" stop-color="#ff2fd0" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ff2fd0" stop-opacity="0.38"/>
    </linearGradient>
    <radialGradient id="core">
      <stop offset="0" stop-color="#ffd6f6"/><stop offset="0.45" stop-color="#ff2fd0"/><stop offset="1" stop-color="#5a0b6e"/>
    </radialGradient>`;

  const root = el('g', { transform: `translate(${CX},0)` }, svg);

  // Background layers, biggest first. Each one turns a little when you change
  // option (parallax) AND drifts slowly on its own, some each way.
  //   len/width: petal size   count: petals in the ring   turn: how much it follows the spin
  const LAYERS = [
    { len: 520, width: 92, count: 18, turn: 0.35, opacity: 0.28, drift: 'drift-slow', glow: false },
    { len: 400, width: 74, count: 16, turn: 0.55, opacity: 0.38, drift: 'drift-rev', glow: false },
    { len: 250, width: 54, count: 16, turn: 0.8, opacity: 0.5, drift: 'drift', glow: true },
    { len: 165, width: 38, count: 14, turn: 1.1, opacity: 0.6, drift: 'drift-rev', glow: true },
    { len: 105, width: 26, count: 12, turn: 1.4, opacity: 0.75, drift: 'drift', glow: true },
  ];
  const layers = LAYERS.map((L, k) => {
    const follow = el('g', {}, root);                       // turned by draw()
    const spin = el('g', { class: L.drift }, follow);         // drifts by CSS
    if (L.glow) spin.setAttribute('filter', 'url(#glow)');
    const offset = k % 2 ? 180 / L.count : 0;                 // stagger rings so petals sit between each other
    for (let i = 0; i < L.count; i++) {
      el('path', { d: petalPath(L.len, L.width), class: 'bg-petal', transform: `rotate(${offset + (i * 360) / L.count})`, opacity: L.opacity }, spin);
    }
    return { follow, turn: L.turn };
  });

  const petals = el('g', {}, root);
  el('circle', { r: 58, fill: 'url(#core)', filter: 'url(#glowStrong)' }, root);
  el('circle', { r: 86, fill: 'none', stroke: '#ff2fd0', 'stroke-width': 1.5, 'stroke-dasharray': '3 7', filter: 'url(#glow)' }, root);

  let options = [];
  let index = 0;
  let shown = 0;           // the angle offset currently drawn (animates toward index)
  let frame = null;
  let nodes = [];
  let fillers = [];        // empty petals (no option) at index -1, -2 ... and after the last one

  function build() {
    petals.textContent = '';
    fillers = [];
    for (let k = 1; k <= FILL; k++) {
      for (const i of [-k, options.length - 1 + k]) {
        const leaf = el('path', { d: petalPath(PETAL * (1 - k * 0.03), 62), class: 'petal-path filler' }, petals);
        fillers.push({ leaf, i });
      }
    }
    nodes = options.map((opt, i) => {
      const g = el('g', { class: 'petal', role: 'option', 'data-id': opt.id }, petals);
      if (opt.color) g.style.setProperty('--c', opt.color);
      const leaf = el('path', { d: petalPath(PETAL, 62), class: 'petal-path' }, g);
      const node = el('g', { class: 'petal-node' }, g);
      el('circle', { class: 'node', r: 28 }, node);
      el('path', { class: 'petal-icon', d: ICONS[opt.icon] ?? ICONS.group, transform: 'translate(-12,-12)' }, node);
      const label = el('text', { class: 'petal-label', x: 42, y: 2 }, node);
      label.textContent = opt.label;
      const sub = el('text', { class: 'petal-sub', x: 42, y: 22 }, node);
      sub.textContent = opt.sub ?? '';
      const badge = el('g', { class: 'petal-badge', transform: 'translate(19,-19)' }, node);
      el('circle', { r: 11 }, badge);
      const bt = el('text', { 'text-anchor': 'middle', y: 4.5 }, badge);
      badge.style.display = 'none';
      node.addEventListener('click', () => { svg.focus({ preventScroll: true }); go(i); });
      return { g, leaf, node, badge, bt, label, sub, i };
    });
    draw();
  }

  // Put every petal at its angle; labels stay upright because we move the
  // node group with translate() instead of rotating it
  function draw() {
    for (const L of layers) L.follow.setAttribute('transform', `rotate(${(-shown * STEP * L.turn).toFixed(2)})`);
    for (const f of fillers) {
      const angle = (f.i - shown) * STEP;
      f.leaf.setAttribute('transform', `rotate(${angle})`);
      f.leaf.style.opacity = Math.max(0, 0.75 - Math.max(0, Math.abs(angle) - 70) / 40).toFixed(2);
    }
    for (const n of nodes) {
      const angle = (n.i - shown) * STEP;
      n.leaf.setAttribute('transform', `rotate(${angle})`);
      const x = NODE_R * Math.cos(rad(angle));
      const y = NODE_R * Math.sin(rad(angle));
      n.node.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      // fade petals as they swing toward the edge of the semicircle
      const fade = Math.max(0, 1 - Math.max(0, Math.abs(angle) - 55) / 40);
      n.g.style.opacity = fade.toFixed(2);
      n.g.style.pointerEvents = fade < 0.3 ? 'none' : '';
      n.g.classList.toggle('selected', n.i === index);
      n.g.setAttribute('aria-selected', n.i === index);
    }
  }

  function animate() {
    cancelAnimationFrame(frame);
    const tick = () => {
      shown += (index - shown) * 0.2;
      if (Math.abs(index - shown) < 0.002) shown = index;
      draw();
      if (shown !== index) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function go(i, { silent = false } = {}) {
    if (!options.length) return;
    const next = Math.max(0, Math.min(options.length - 1, i));
    if (next === index && !silent) { draw(); return; }
    index = next;
    animate();
    if (!silent) onSelect?.(options[index].id);
  }

  // keyboard: works anywhere on the page unless you're typing in a box
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, dialog')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(options.length - 1); }
  });

  // wheel: one step per "notch", ignoring the flood of events from trackpads
  let lastWheel = 0;
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const t = performance.now();
    if (t - lastWheel < 180) return;
    lastWheel = t;
    go(index + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  return {
    // options: [{ id, label, sub?, icon, color? }]
    setOptions(list, selectedId) {
      // Same options as before? Only refresh the text, so a running spin isn't interrupted
      if (list.map((o) => o.id).join('|') === options.map((o) => o.id).join('|')) {
        options = list;
        nodes.forEach((n) => { n.label.textContent = list[n.i].label; n.sub.textContent = list[n.i].sub ?? ''; });
        return options[index]?.id;
      }
      options = list;
      const keep = list.findIndex((o) => o.id === selectedId);
      index = keep >= 0 ? keep : 0;
      shown = index;
      build();
      return options[index]?.id;
    },
    select(id) { const i = options.findIndex((o) => o.id === id); if (i >= 0) go(i); },
    get selected() { return options[index]?.id; },
    // counts: { optionId: number } of new items
    setBadges(counts) {
      for (const n of nodes) {
        const c = counts[options[n.i].id] ?? 0;
        n.badge.style.display = c ? '' : 'none';
        n.bt.textContent = c > 9 ? '9+' : String(c);
      }
    },
  };
}
