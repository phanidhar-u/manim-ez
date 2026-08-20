/* ============================================================
   MANIM EZ — Frontend Application Logic
   ============================================================ */

const API = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http'))
  ? window.location.origin
  : 'http://localhost:8000';

// ─── State ──────────────────────────────────────────────────
let objects    = [];   // { id, type, color, position, ...props }
let animations = [];   // { obj_id, type, duration, start_time, ... }
let selectedId = null;
let quality    = 'low';
let objCounter = 0;
let lastScript = '';
let lastVideoUrl = '';

// ─── DOM refs ───────────────────────────────────────────────
const canvasArea    = document.getElementById('canvas-area');
const canvasEmpty   = document.getElementById('canvas-empty');
const propsEmpty    = document.getElementById('props-empty');
const propsForm     = document.getElementById('props-form');
const renderVideo   = document.getElementById('render-video');
const renderSpinner = document.getElementById('render-spinner');
const previewPh     = document.getElementById('preview-placeholder');
const previewStatus = document.getElementById('preview-status');
const spinnerLabel  = document.getElementById('spinner-label');
const btnRender     = document.getElementById('btn-render');
const btnClear      = document.getElementById('btn-clear');
const btnCode       = document.getElementById('btn-code');
const codePanel     = document.getElementById('code-panel');
const codeContent   = document.getElementById('code-content');
const toast         = document.getElementById('toast');

// Re-position canvas elements dynamically when canvasArea resizes
if (typeof ResizeObserver !== 'undefined' && canvasArea) {
  const canvasResizeObserver = new ResizeObserver(() => {
    objects.forEach(obj => updateCanvasElement(obj));
  });
  canvasResizeObserver.observe(canvasArea);
}


// ─── Utility ────────────────────────────────────────────────
function uid() { return 'obj_' + (++objCounter); }

function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = type ? `show ${type}` : 'show';
  setTimeout(() => { toast.className = ''; }, 3200);
}

function randomColor() {
  const palette = ['#7c6af7','#f87171','#4ecb71','#fbbf24','#60a5fa','#f472b6','#34d399','#a78bfa'];
  return palette[Math.floor(Math.random() * palette.length)];
}

// Canvas pixel coords → Manim world coords
function canvasToManimCoords(px, py) {
  const rect = canvasArea.getBoundingClientRect();
  const w = rect.width  || 800;
  const h = rect.height || 450;
  const mx = ((px / w) - 0.5) * 14.22;
  const my = (0.5 - (py / h)) * 8;
  return [parseFloat(mx.toFixed(3)), parseFloat(my.toFixed(3))];
}

// Manim world coords → Canvas pixel coords
function manimToCanvasCoords(mx, my) {
  const rect = canvasArea.getBoundingClientRect();
  const w = rect.width  || 800;
  const h = rect.height || 450;
  const px = ((mx / 14.22) + 0.5) * w;
  const py = (0.5 - (my / 8)) * h;
  return [px, py];
}


// ─── Canvas Object Rendering (SVG preview) ──────────────────
const SHAPE_DEFAULTS = {
  Circle:    { radius: 1.0,  fill_opacity: 0.7 },
  Square:    { side_length: 2.0, fill_opacity: 0.7 },
  Triangle:  { fill_opacity: 0.7 },
  Rectangle: { width: 3.0, height: 2.0, fill_opacity: 0.7 },
  Line:      { stroke_width: 3, fill_opacity: 0 },
  Dot:       { radius: 0.12, fill_opacity: 1 },
  Arrow:     { stroke_width: 3, fill_opacity: 0 },
  Star:      { fill_opacity: 0.7 },
  Text:      { text: 'Hello!', font_size: 36, fill_opacity: 1 },
  MathTex:   { text: 'E = mc^2', fill_opacity: 1 },
};

// Visual size on the canvas for each shape type
const SHAPE_SIZE = {
  Circle: 56, Square: 56, Triangle: 56, Rectangle: 70,
  Line: 70, Dot: 30, Arrow: 70, Star: 56, Text: 70, MathTex: 80,
};

function renderSVGPreview(obj) {
  const size = SHAPE_SIZE[obj.type] || 56;
  const half = size / 2;
  const c    = obj.color || '#7c6af7';
  const op   = obj.fill_opacity !== undefined ? obj.fill_opacity : 0.7;
  const sw   = obj.stroke_width || 2;

  let inner = '';
  const vb = `0 0 ${size} ${size}`;

  switch (obj.type) {
    case 'Circle':
      inner = `<circle cx="${half}" cy="${half}" r="${half - 4}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Square':
      inner = `<rect x="4" y="4" width="${size - 8}" height="${size - 8}" rx="2" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Triangle':
      inner = `<polygon points="${half},4 ${size - 4},${size - 4} 4,${size - 4}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Rectangle':
      inner = `<rect x="4" y="${half - 14}" width="${size - 8}" height="28" rx="2" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Line':
      inner = `<line x1="4" y1="${half}" x2="${size - 4}" y2="${half}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`;
      break;
    case 'Dot':
      inner = `<circle cx="${half}" cy="${half}" r="${half - 4}" fill="${c}"/>`;
      break;
    case 'Arrow':
      inner = `<line x1="4" y1="${half}" x2="${size - 14}" y2="${half}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
               <polygon points="${size - 14},${half - 8} ${size - 2},${half} ${size - 14},${half + 8}" fill="${c}"/>`;
      break;
    case 'Star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const angle  = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? half - 3 : (half - 3) * 0.4;
        pts.push(`${half + radius * Math.cos(angle)},${half + radius * Math.sin(angle)}`);
      }
      inner = `<polygon points="${pts.join(' ')}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    }
    case 'Text':
      inner = `<text x="${half}" y="${half + 5}" text-anchor="middle" fill="${c}" font-family="Inter,sans-serif" font-size="16" font-weight="600">${(obj.text || 'T').substring(0, 6)}</text>`;
      break;
    case 'MathTex':
      inner = `<text x="${half}" y="${half + 5}" text-anchor="middle" fill="${c}" font-family="serif" font-size="14" font-style="italic">${(obj.text || 'eq').substring(0, 8)}</text>`;
      break;
    default:
      inner = `<circle cx="${half}" cy="${half}" r="${half - 4}" fill="${c}" fill-opacity="0.7"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb}">${inner}</svg>`;
}


// ─── Canvas Object DOM Management ───────────────────────────
function getShapeHalf(type) {
  return (SHAPE_SIZE[type] || 56) / 2;
}

function createCanvasElement(obj) {
  const div = document.createElement('div');
  div.className = 'canvas-obj';
  div.id = `canvas-${obj.id}`;
  div.dataset.objId = obj.id;

  const size = SHAPE_SIZE[obj.type] || 56;
  div.style.width  = `${size}px`;
  div.style.height = `${size}px`;

  // Position
  const [px, py] = manimToCanvasCoords(obj.position[0], obj.position[1]);
  const half = getShapeHalf(obj.type);
  div.style.left = `${px - half}px`;
  div.style.top  = `${py - half}px`;

  div.innerHTML = renderSVGPreview(obj);

  // Select on click (without interfering with drag)
  div.addEventListener('click', (e) => {
    e.stopPropagation();
    selectObject(obj.id);
  });

  canvasArea.appendChild(div);
}

function updateCanvasElement(obj) {
  const div = document.getElementById(`canvas-${obj.id}`);
  if (!div) return;
  const size = SHAPE_SIZE[obj.type] || 56;
  div.style.width  = `${size}px`;
  div.style.height = `${size}px`;
  const [px, py] = manimToCanvasCoords(obj.position[0], obj.position[1]);
  const half = getShapeHalf(obj.type);
  div.style.left = `${px - half}px`;
  div.style.top  = `${py - half}px`;
  div.innerHTML = renderSVGPreview(obj);
}

function removeCanvasElement(id) {
  const el = document.getElementById(`canvas-${id}`);
  if (el) el.remove();
}

function syncCanvasEmpty() {
  canvasEmpty.classList.toggle('hidden', objects.length > 0);
}


// ─── UNIFIED DRAG SYSTEM ─────────────────────────────────────
// One global drag state — only one thing can drag at a time.
const drag = {
  active: false,       // is a drag in progress?
  source: null,        // 'palette' | 'canvas'
  type: null,          // shape type (palette drag)
  objId: null,         // obj id (canvas drag)
  el: null,            // DOM element being dragged (canvas obj)
  startClientX: 0,
  startClientY: 0,
  startLeft: 0,        // element left at drag start (px)
  startTop: 0,         // element top at drag start (px)
  ghost: null,         // ghost element for palette drag
};

// ── Palette → Canvas (HTML5 drag) ──────────────────────────
document.querySelectorAll('.element-chip').forEach(chip => {
  chip.addEventListener('dragstart', (e) => {
    drag.source = 'palette';
    drag.type   = chip.dataset.type;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', drag.type);
    chip.classList.add('dragging');
  });

  chip.addEventListener('dragend', () => {
    chip.classList.remove('dragging');
    drag.source = null;
    drag.type   = null;
    canvasArea.classList.remove('drag-over');
  });
});

canvasArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  canvasArea.classList.add('drag-over');
});

canvasArea.addEventListener('dragleave', (e) => {
  if (!canvasArea.contains(e.relatedTarget)) {
    canvasArea.classList.remove('drag-over');
  }
});

// Also allow drop on the outer panel-canvas (catches misses)
const panelCanvas = document.getElementById('panel-canvas');
panelCanvas.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  canvasArea.classList.add('drag-over');
});

panelCanvas.addEventListener('drop', handlePaletteDrop);
canvasArea.addEventListener('drop', handlePaletteDrop);

function handlePaletteDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  canvasArea.classList.remove('drag-over');

  const type = drag.type || e.dataTransfer.getData('text/plain');
  if (!type) return;

  // Convert drop point → canvas-relative coords
  const canvasRect = canvasArea.getBoundingClientRect();
  let px = e.clientX - canvasRect.left;
  let py = e.clientY - canvasRect.top;

  // Clamp
  const half = getShapeHalf(type);
  px = Math.max(half, Math.min(canvasRect.width  - half, px));
  py = Math.max(half, Math.min(canvasRect.height - half, py));

  const [mx, my] = canvasToManimCoords(px, py);

  const defaults = SHAPE_DEFAULTS[type] || {};
  const obj = {
    id: uid(),
    type,
    color: randomColor(),
    position: [mx, my],
    ...defaults,
  };

  objects.push(obj);
  createCanvasElement(obj);
  syncCanvasEmpty();
  selectObject(obj.id);
  showToast(`Added ${type}`, 'success');
}

// ── Canvas object → move (pointer events) ──────────────────
// We use a single pair of global pointer listeners attached once,
// so there is NO listener accumulation.

canvasArea.addEventListener('mousedown', onCanvasMouseDown, true);
document.addEventListener('mousemove',  onGlobalMouseMove);
document.addEventListener('mouseup',    onGlobalMouseUp);

function onCanvasMouseDown(e) {
  if (e.button !== 0) return;

  // Walk up from target to find a .canvas-obj
  let target = e.target;
  while (target && target !== canvasArea) {
    if (target.classList && target.classList.contains('canvas-obj')) break;
    target = target.parentElement;
  }
  if (!target || !target.classList.contains('canvas-obj')) return;

  const objId = target.dataset.objId;
  const obj   = objects.find(o => o.id === objId);
  if (!obj) return;

  e.preventDefault(); // prevent text selection during drag
  e.stopPropagation();

  const rect = target.getBoundingClientRect();

  drag.active       = true;
  drag.source       = 'canvas';
  drag.objId        = objId;
  drag.el           = target;
  drag.startClientX = e.clientX;
  drag.startClientY = e.clientY;
  drag.startLeft    = parseFloat(target.style.left) || 0;
  drag.startTop     = parseFloat(target.style.top)  || 0;

  target.style.zIndex = '50';
  target.classList.add('dragging');

  selectObject(objId);
}

function onGlobalMouseMove(e) {
  if (!drag.active || drag.source !== 'canvas') return;

  const dx = e.clientX - drag.startClientX;
  const dy = e.clientY - drag.startClientY;

  const canvasRect = canvasArea.getBoundingClientRect();
  const el   = drag.el;
  const size = el.querySelector('svg')
    ? parseInt(el.querySelector('svg').getAttribute('width'))
    : 56;

  let newLeft = drag.startLeft + dx;
  let newTop  = drag.startTop  + dy;

  // Clamp so shape stays inside canvas
  newLeft = Math.max(0, Math.min(canvasRect.width  - size, newLeft));
  newTop  = Math.max(0, Math.min(canvasRect.height - size, newTop));

  el.style.left = `${newLeft}px`;
  el.style.top  = `${newTop}px`;

  // Update the data model (center of shape)
  const half = size / 2;
  const [mx, my] = canvasToManimCoords(newLeft + half, newTop + half);
  const obj = objects.find(o => o.id === drag.objId);
  if (obj) obj.position = [mx, my];
}

function onGlobalMouseUp() {
  if (!drag.active || drag.source !== 'canvas') return;

  drag.el.style.zIndex = '';
  drag.el.classList.remove('dragging');

  // Refresh props if this is still selected
  if (selectedId === drag.objId) renderPropsPanel();

  drag.active = false;
  drag.source = null;
  drag.objId  = null;
  drag.el     = null;
}

// Deselect when clicking the canvas background
canvasArea.addEventListener('click', (e) => {
  if (e.target === canvasArea || e.target === canvasEmpty) {
    selectObject(null);
  }
});


// ─── Selection ───────────────────────────────────────────────
function selectObject(id) {
  document.querySelectorAll('.canvas-obj.selected').forEach(el => el.classList.remove('selected'));
  selectedId = id;

  if (id) {
    const el = document.getElementById(`canvas-${id}`);
    if (el) el.classList.add('selected');
  }

  renderPropsPanel();
}


// ─── Properties Panel ────────────────────────────────────────
const ANIMATION_TYPES = [
  'FadeIn', 'FadeOut', 'GrowFromCenter', 'Create', 'Write',
  'DrawBorderThenFill', 'Uncreate', 'Rotate', 'Flash', 'Indicate', 'Transform',
];

function renderPropsPanel() {
  if (!selectedId) {
    propsEmpty.style.display = '';
    propsForm.style.display  = 'none';
    propsForm.innerHTML = '';
    return;
  }

  const obj = objects.find(o => o.id === selectedId);
  if (!obj) return;

  propsEmpty.style.display = 'none';
  propsForm.style.display  = 'flex';

  let html = `
    <div id="selected-obj-chip">
      <span class="chip-type">${obj.type}</span>
      <span class="chip-id">${obj.id}</span>
    </div>

    <div class="prop-section">
      <div class="prop-section-title">Appearance</div>

      <div class="prop-row">
        <span class="prop-label">Color</span>
        <input class="prop-input" type="color" id="prop-color" value="${obj.color || '#7c6af7'}" />
      </div>

      <div class="prop-row">
        <span class="prop-label">Fill %</span>
        <input class="prop-input" type="number" id="prop-fill" min="0" max="1" step="0.1"
               value="${obj.fill_opacity !== undefined ? obj.fill_opacity : 0.7}" />
      </div>

      <div class="prop-row">
        <span class="prop-label">Stroke</span>
        <input class="prop-input" type="number" id="prop-stroke" min="0" max="10" step="0.5"
               value="${obj.stroke_width || 2}" />
      </div>
  `;

  if (obj.type === 'Circle' || obj.type === 'Dot') {
    html += `
      <div class="prop-row">
        <span class="prop-label">Radius</span>
        <input class="prop-input" type="number" id="prop-radius" min="0.1" step="0.1"
               value="${obj.radius || 1.0}" />
      </div>`;
  }
  if (obj.type === 'Square') {
    html += `
      <div class="prop-row">
        <span class="prop-label">Side</span>
        <input class="prop-input" type="number" id="prop-side" min="0.1" step="0.1"
               value="${obj.side_length || 2.0}" />
      </div>`;
  }
  if (obj.type === 'Rectangle') {
    html += `
      <div class="prop-row">
        <span class="prop-label">Width</span>
        <input class="prop-input" type="number" id="prop-width" min="0.1" step="0.1"
               value="${obj.width || 3.0}" />
      </div>
      <div class="prop-row">
        <span class="prop-label">Height</span>
        <input class="prop-input" type="number" id="prop-height" min="0.1" step="0.1"
               value="${obj.height || 2.0}" />
      </div>`;
  }
  if (obj.type === 'Text' || obj.type === 'MathTex') {
    html += `
      <div class="prop-row">
        <span class="prop-label">Text</span>
        <input class="prop-input" type="text" id="prop-text"
               value="${obj.text || ''}" placeholder="${obj.type === 'MathTex' ? 'E = mc^2' : 'Hello!'}" />
      </div>`;
    if (obj.type === 'Text') {
      html += `
      <div class="prop-row">
        <span class="prop-label">Size</span>
        <input class="prop-input" type="number" id="prop-fontsize" min="12" max="120" step="4"
               value="${obj.font_size || 36}" />
      </div>`;
    }
  }

  html += `
    </div>

    <div class="prop-section">
      <div class="prop-section-title">Position</div>
      <div class="prop-row">
        <span class="prop-label">X</span>
        <input class="prop-input" type="number" id="prop-x" step="0.1" value="${obj.position[0]}" />
      </div>
      <div class="prop-row">
        <span class="prop-label">Y</span>
        <input class="prop-input" type="number" id="prop-y" step="0.1" value="${obj.position[1]}" />
      </div>
      <div class="prop-row">
        <span class="prop-label">Scale</span>
        <input class="prop-input" type="number" id="prop-scale" min="0.1" step="0.1"
               value="${obj.scale || 1.0}" />
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-section-title">Animations</div>
      <div id="anim-list"></div>
      <button id="btn-add-anim">＋ Add animation step</button>
    </div>

    <button id="btn-delete-obj">🗑 Delete object</button>
  `;

  propsForm.innerHTML = html;
  renderAnimList(obj.id);

  // ── Wire up property listeners ──
  function bindProp(elId, key, parser = v => v) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener('input', () => {
      obj[key] = parser(el.value);
      updateCanvasElement(obj);
    });
  }

  bindProp('prop-color',    'color');
  bindProp('prop-fill',     'fill_opacity', parseFloat);
  bindProp('prop-stroke',   'stroke_width', parseFloat);
  bindProp('prop-radius',   'radius', parseFloat);
  bindProp('prop-side',     'side_length', parseFloat);
  bindProp('prop-width',    'width', parseFloat);
  bindProp('prop-height',   'height', parseFloat);
  bindProp('prop-text',     'text');
  bindProp('prop-fontsize', 'font_size', parseInt);
  bindProp('prop-scale',    'scale', parseFloat);

  document.getElementById('prop-x')?.addEventListener('input', (e) => {
    obj.position = [parseFloat(e.target.value), obj.position[1]];
    updateCanvasElement(obj);
  });
  document.getElementById('prop-y')?.addEventListener('input', (e) => {
    obj.position = [obj.position[0], parseFloat(e.target.value)];
    updateCanvasElement(obj);
  });

  document.getElementById('btn-add-anim')?.addEventListener('click', () => {
    const myAnims = animations.filter(a => a.obj_id === obj.id);
    const lastEnd = myAnims.length > 0
      ? Math.max(...myAnims.map(a => a.start_time + a.duration))
      : 0;
    animations.push({
      obj_id: obj.id,
      type: 'FadeIn',
      duration: 1.0,
      start_time: parseFloat(lastEnd.toFixed(2)),
    });
    renderAnimList(obj.id);
  });

  document.getElementById('btn-delete-obj')?.addEventListener('click', () => {
    deleteObject(obj.id);
  });
}


function renderAnimList(objId) {
  const list = document.getElementById('anim-list');
  if (!list) return;

  const myAnims = animations.filter(a => a.obj_id === objId);

  if (myAnims.length === 0) {
    list.innerHTML = `<p style="font-size:11px; color:var(--text-dim); text-align:center; padding: 8px 0;">No animations yet</p>`;
    return;
  }

  list.innerHTML = myAnims.map((anim, idx) => {
    const typeOptions = ANIMATION_TYPES
      .map(t => `<option value="${t}" ${t === anim.type ? 'selected' : ''}>${t}</option>`)
      .join('');
    const globalIdx = animations.indexOf(anim);

    return `
      <div class="anim-entry" data-anim-idx="${globalIdx}">
        <div class="anim-entry-header">
          <span class="anim-badge">#${idx + 1}</span>
          <button class="anim-entry-remove" data-idx="${globalIdx}" title="Remove">✕</button>
        </div>
        <div class="anim-entry-row">
          <select class="prop-select" style="flex:2" data-anim-field="type" data-idx="${globalIdx}">
            ${typeOptions}
          </select>
        </div>
        <div class="anim-entry-row">
          <input class="prop-input" type="number" placeholder="Start" min="0" step="0.1"
                 value="${anim.start_time}" data-anim-field="start_time" data-idx="${globalIdx}" style="flex:1" />
          <input class="prop-input" type="number" placeholder="Dur" min="0.1" step="0.1"
                 value="${anim.duration}" data-anim-field="duration" data-idx="${globalIdx}" style="flex:1" />
        </div>
        ${anim.type === 'Rotate' ? `
        <div class="anim-entry-row">
          <span class="prop-label" style="width:auto">Angle°</span>
          <input class="prop-input" type="number" step="15" value="${anim.angle || 90}"
                 data-anim-field="angle" data-idx="${globalIdx}" />
        </div>` : ''}
        ${anim.type === 'Transform' ? `
        <div class="anim-entry-row">
          <span class="prop-label" style="width:auto">→ Target</span>
          <select class="prop-select" data-anim-field="target_id" data-idx="${globalIdx}">
            ${objects.filter(o => o.id !== objId)
              .map(o => `<option value="${o.id}" ${anim.target_id === o.id ? 'selected' : ''}>${o.type} (${o.id})</option>`)
              .join('') || '<option value="">none</option>'}
          </select>
        </div>` : ''}
      </div>`;
  }).join('');

  list.querySelectorAll('[data-anim-field]').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx   = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.animField;
      const val   = (field === 'type' || field === 'target_id') ? e.target.value : parseFloat(e.target.value);
      animations[idx][field] = val;
      if (field === 'type') renderAnimList(objId);
    });
    el.addEventListener('input', (e) => {
      if (e.target.tagName === 'SELECT') return;
      const idx   = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.animField;
      animations[idx][field] = parseFloat(e.target.value);
    });
  });

  list.querySelectorAll('.anim-entry-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      animations.splice(idx, 1);
      renderAnimList(objId);
    });
  });
}


// ─── Delete object ───────────────────────────────────────────
function deleteObject(id) {
  objects    = objects.filter(o => o.id !== id);
  animations = animations.filter(a => a.obj_id !== id);
  removeCanvasElement(id);
  selectObject(null);
  syncCanvasEmpty();
  showToast('Object deleted');
}


// ─── Clear canvas ────────────────────────────────────────────
btnClear.addEventListener('click', () => {
  objects    = [];
  animations = [];
  objCounter = 0;
  document.querySelectorAll('.canvas-obj').forEach(el => el.remove());
  selectObject(null);
  syncCanvasEmpty();
  showToast('Canvas cleared');
});


// ─── Quality toggle ──────────────────────────────────────────
document.querySelectorAll('.quality-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quality = btn.dataset.q;
  });
});


// ─── Code panel toggle ───────────────────────────────────────
btnCode.addEventListener('click', () => {
  codePanel.classList.toggle('open');
  if (codePanel.classList.contains('open') && lastScript) {
    codeContent.textContent = lastScript;
  }
});


// ─── Download button ─────────────────────────────────────────
const btnDownload = document.getElementById('btn-download');
if (btnDownload) {
  btnDownload.addEventListener('click', () => {
    if (!lastVideoUrl) {
      showToast('Render something first!', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href     = lastVideoUrl;
    a.download = 'manim-ez-animation.mp4';
    a.click();
    showToast('Downloading…', 'success');
  });
}


// ─── Render ──────────────────────────────────────────────────
btnRender.addEventListener('click', renderScene);

async function renderScene() {
  if (objects.length === 0) {
    showToast('Add at least one object first!', 'error');
    return;
  }

  // Auto-add FadeIn for objects with no animation
  const objsWithNoAnim = objects.filter(o => !animations.find(a => a.obj_id === o.id));
  objsWithNoAnim.forEach((o, i) => {
    animations.push({ obj_id: o.id, type: 'FadeIn', duration: 1.0, start_time: i * 0.3 });
  });

  setLoadingState(true);

  const payload = {
    objects:          objects.map(o => ({ ...o })),
    animations:       animations.map(a => ({ ...a })),
    background_color: '#1C1C2E',
    quality,
  };

  try {
    const res  = await fetch(`${API}/render`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Render API returned error status:', res.status, data);
      let errMsg = 'Render error';
      if (typeof data.detail === 'object') {
        errMsg = data.detail.error || 'Render error';
        if (data.detail.stderr) {
          console.error('--- MANIM STDERR TRACEBACK ---');
          console.error(data.detail.stderr);
        }
      } else if (data.detail) {
        errMsg = data.detail;
      }
      throw new Error(errMsg);
    }

    lastScript   = data.script || '';
    lastVideoUrl = `${API}${data.url}?t=${Date.now()}`;

    if (codePanel.classList.contains('open')) {
      codeContent.textContent = lastScript;
    }

    setLoadingState(false);
    showVideo(lastVideoUrl);
    showToast('Render complete! 🎉', 'success');

    // Show download button
    if (btnDownload) btnDownload.classList.add('active');

  } catch (err) {
    setLoadingState(false);
    setStatus(`Error: ${err.message}`, 'error');
    showToast(`Render failed: ${err.message}`, 'error');
    console.error('Render process failed:', err);
  }
}

function setLoadingState(loading) {
  btnRender.classList.toggle('loading', loading);
  document.getElementById('render-icon').textContent = loading ? '⏳' : '▶';

  if (loading) {
    previewPh.style.display = 'none';
    renderVideo.classList.remove('visible');
    renderSpinner.classList.add('visible');
    setStatus('Rendering…', 'loading');

    const msgs = ['Generating scene…', 'Running Manim…', 'Encoding video…', 'Almost there…'];
    let i = 0;
    spinnerLabel.textContent = msgs[i];
    window._spinnerInterval = setInterval(() => {
      i = (i + 1) % msgs.length;
      spinnerLabel.textContent = msgs[i];
    }, 2200);
  } else {
    clearInterval(window._spinnerInterval);
    renderSpinner.classList.remove('visible');
  }
}

function showVideo(url) {
  previewPh.style.display = 'none';
  renderVideo.src = url;
  renderVideo.classList.add('visible');
  renderVideo.play().catch(() => {});
  setStatus('Ready ✓', 'ready');
}

function setStatus(msg, cls = '') {
  previewStatus.textContent = msg;
  previewStatus.className = cls;
}


// ─── Init ────────────────────────────────────────────────────
syncCanvasEmpty();
renderPropsPanel();
console.log('%c🎬 Manim EZ ready. Drop elements onto the canvas!', 'color:#7c6af7; font-weight:bold; font-size:14px;');
