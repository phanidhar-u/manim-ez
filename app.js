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

function getUnitPx() {
  const rect = canvasArea ? canvasArea.getBoundingClientRect() : null;
  const h = (rect && rect.height) ? rect.height : 450;
  return h / 8.0;
}

function getShapeDimensions(obj) {
  const unitPx = getUnitPx();
  const shapeType = typeof obj === 'string' ? obj : (obj ? obj.type : 'Circle');

  if (shapeType === 'Circle') {
    const r = (obj && typeof obj === 'object' && obj.radius) ? obj.radius : 1.0;
    const size = Math.max(12, Math.round(2 * r * unitPx));
    return { width: size, height: size, fs: 16 };
  }

  if (shapeType === 'Square') {
    const s = (obj && typeof obj === 'object' && obj.side_length) ? obj.side_length : 2.0;
    const size = Math.max(12, Math.round(s * unitPx));
    return { width: size, height: size, fs: 16 };
  }

  if (shapeType === 'Triangle') {
    const w = Math.round(2.0 * unitPx);
    const h = Math.round(1.732 * unitPx);
    return { width: w, height: h, fs: 16 };
  }

  if (shapeType === 'Rectangle') {
    const wVal = (obj && typeof obj === 'object' && obj.width) ? obj.width : 3.0;
    const hVal = (obj && typeof obj === 'object' && obj.height) ? obj.height : 2.0;
    const w = Math.max(16, Math.round(wVal * unitPx));
    const h = Math.max(16, Math.round(hVal * unitPx));
    return { width: w, height: h, fs: 16 };
  }

  if (shapeType === 'Line') {
    const w = Math.round(4.0 * unitPx);
    const h = Math.max(20, Math.round((obj && typeof obj === 'object' && obj.stroke_width ? obj.stroke_width : 3) * 4));
    return { width: w, height: h, fs: 16 };
  }

  if (shapeType === 'Arrow') {
    const w = Math.round(3.0 * unitPx);
    const h = Math.max(30, Math.round((obj && typeof obj === 'object' && obj.stroke_width ? obj.stroke_width : 3) * 5));
    return { width: w, height: h, fs: 16 };
  }

  if (shapeType === 'Dot') {
    const r = (obj && typeof obj === 'object' && obj.radius) ? obj.radius : 0.12;
    const size = Math.max(6, Math.round(2 * r * unitPx));
    return { width: size, height: size, fs: 16 };
  }

  if (shapeType === 'Star') {
    const size = Math.round(2.0 * unitPx);
    return { width: size, height: size, fs: 16 };
  }

  if (shapeType === 'Text' || shapeType === 'MathTex') {
    const textStr = (obj && typeof obj === 'object' && obj.text !== undefined && obj.text !== null)
      ? String(obj.text)
      : (shapeType === 'MathTex' ? 'E = mc^2' : 'Hello!');
    const userFs = (obj && typeof obj === 'object' && obj.font_size) ? obj.font_size : 36;
    const hManim = (userFs / 36.0) * 0.52;
    const height = Math.max(24, Math.round(hManim * unitPx));
    const charW = shapeType === 'MathTex' ? height * 0.75 : height * 0.65;
    const width = Math.max(40, Math.ceil(textStr.length * charW + 16));
    const fs = Math.max(12, Math.round(height * 0.7));
    return { width, height, fs };
  }

  const defaultSize = Math.round(2.0 * unitPx);
  return { width: defaultSize, height: defaultSize, fs: 16 };
}

function renderSVGPreview(obj) {
  const { width, height, fs } = getShapeDimensions(obj);
  const halfX = width / 2;
  const halfY = height / 2;
  const c    = obj.color || '#7c6af7';
  const op   = obj.fill_opacity !== undefined ? obj.fill_opacity : 0.7;
  const sw   = obj.stroke_width || 2;

  let inner = '';
  const vb = `0 0 ${width} ${height}`;

  switch (obj.type) {
    case 'Circle':
      inner = `<circle cx="${halfX}" cy="${halfY}" r="${halfX - 4}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Square':
      inner = `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="2" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Triangle':
      inner = `<polygon points="${halfX},4 ${width - 4},${height - 4} 4,${height - 4}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Rectangle':
      inner = `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="2" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    case 'Line':
      inner = `<line x1="4" y1="${halfY}" x2="${width - 4}" y2="${halfY}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`;
      break;
    case 'Dot':
      inner = `<circle cx="${halfX}" cy="${halfY}" r="${Math.min(halfX, halfY) - 2}" fill="${c}"/>`;
      break;
    case 'Arrow':
      inner = `<line x1="4" y1="${halfY}" x2="${width - 16}" y2="${halfY}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
               <polygon points="${width - 16},${halfY - 8} ${width - 2},${halfY} ${width - 16},${halfY + 8}" fill="${c}"/>`;
      break;
    case 'Star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const angle  = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? halfX - 3 : (halfX - 3) * 0.4;
        pts.push(`${halfX + radius * Math.cos(angle)},${halfY + radius * Math.sin(angle)}`);
      }
      inner = `<polygon points="${pts.join(' ')}" fill="${c}" fill-opacity="${op}" stroke="${c}" stroke-width="${sw}"/>`;
      break;
    }
    case 'Text': {
      const str = obj.text || 'Hello!';
      const safeStr = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      inner = `<text x="${halfX}" y="${halfY + fs * 0.35}" text-anchor="middle" fill="${c}" fill-opacity="${op}" font-family="Inter, system-ui, sans-serif" font-size="${fs}" font-weight="600">${safeStr}</text>`;
      break;
    }
    case 'MathTex': {
      const str = obj.text || 'E = mc^2';
      const safeStr = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      inner = `<rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="4" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-opacity="0.3" stroke-dasharray="3 3"/>
               <text x="${halfX}" y="${halfY + fs * 0.35}" text-anchor="middle" fill="${c}" fill-opacity="${op}" font-family="serif" font-size="${fs}" font-style="italic">${safeStr}</text>`;
      break;
    }
    default:
      inner = `<circle cx="${halfX}" cy="${halfY}" r="${halfX - 4}" fill="${c}" fill-opacity="0.7"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vb}">${inner}</svg>`;
}


// ─── Canvas Object DOM Management ───────────────────────────
function getShapeHalf(obj) {
  const { width, height } = getShapeDimensions(obj);
  return { halfW: width / 2, halfH: height / 2 };
}

function createCanvasElement(obj) {
  const div = document.createElement('div');
  div.className = 'canvas-obj';
  div.id = `canvas-${obj.id}`;
  div.dataset.objId = obj.id;

  const { width, height } = getShapeDimensions(obj);
  div.style.width  = `${width}px`;
  div.style.height = `${height}px`;

  // Position & Scale
  const [px, py] = manimToCanvasCoords(obj.position[0], obj.position[1]);
  div.style.left = `${px - width / 2}px`;
  div.style.top  = `${py - height / 2}px`;
  const scale = (obj.scale !== undefined && obj.scale !== null && !isNaN(obj.scale)) ? obj.scale : 1.0;
  div.style.transform = `scale(${scale})`;

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
  const { width, height } = getShapeDimensions(obj);
  div.style.width  = `${width}px`;
  div.style.height = `${height}px`;
  const [px, py] = manimToCanvasCoords(obj.position[0], obj.position[1]);
  div.style.left = `${px - width / 2}px`;
  div.style.top  = `${py - height / 2}px`;
  const scale = (obj.scale !== undefined && obj.scale !== null && !isNaN(obj.scale)) ? obj.scale : 1.0;
  div.style.transform = `scale(${scale})`;
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
  const { halfW, halfH } = getShapeHalf(type);
  px = Math.max(halfW, Math.min(canvasRect.width  - halfW, px));
  py = Math.max(halfH, Math.min(canvasRect.height - halfH, py));

  const [mx, my] = canvasToManimCoords(px, py);

  const defaults = SHAPE_DEFAULTS[type] || {};
  const obj = {
    id: uid(),
    type,
    color: randomColor(),
    position: [mx, my],
    scale: 1.0,
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
  const obj  = objects.find(o => o.id === drag.objId);
  const { width, height } = getShapeDimensions(obj);

  let newLeft = drag.startLeft + dx;
  let newTop  = drag.startTop  + dy;

  // Clamp so shape stays inside canvas
  newLeft = Math.max(0, Math.min(canvasRect.width  - width, newLeft));
  newTop  = Math.max(0, Math.min(canvasRect.height - height, newTop));

  el.style.left = `${newLeft}px`;
  el.style.top  = `${newTop}px`;

  // Update the data model (center of shape)
  const [mx, my] = canvasToManimCoords(newLeft + width / 2, newTop + height / 2);
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
  { value: 'Create',               label: '✨ Create (Draw shape)' },
  { value: 'FadeIn',               label: '🌟 Fade In' },
  { value: 'Write',                label: '✍️ Write (Text / Equations)' },
  { value: 'GrowFromCenter',       label: '🌱 Grow From Center' },
  { value: 'DrawBorderThenFill',   label: '🎨 Draw Border & Fill' },
  { value: 'Transform',            label: '🔄 Transform (Morph into...)' },
  { value: 'ReplacementTransform', label: '🔀 Replace & Morph into...' },
  { value: 'Rotate',               label: '🔃 Rotate' },
  { value: 'Flash',                label: '⚡ Flash highlight' },
  { value: 'Indicate',             label: '👉 Indicate pulse' },
  { value: 'FadeOut',              label: '🌫️ Fade Out' },
  { value: 'Uncreate',             label: '💨 Uncreate (Erase)' },
];

function getTimelineSummaryHtml() {
  if (animations.length === 0) return '';

  const sorted = [...animations].sort((a, b) => (a.start_time || 0) - (b.start_time || 0));
  const maxEnd = Math.max(...sorted.map(a => (a.start_time || 0) + (a.duration || 1.0)), 0);

  const itemsHtml = sorted.map(a => {
    const obj = objects.find(o => o.id === a.obj_id);
    const start = (a.start_time || 0).toFixed(1);
    const end = ((a.start_time || 0) + (a.duration || 1.0)).toFixed(1);
    const objName = obj ? `${obj.type} (${obj.id})` : a.obj_id;
    let actionDesc = a.type;
    if (a.type === 'Transform' || a.type === 'ReplacementTransform') {
      const targetObj = objects.find(o => o.id === a.target_id);
      const targetName = targetObj ? `${targetObj.type} (${targetObj.id})` : (a.target_id || 'none');
      actionDesc = `Transform ➔ ${targetName}`;
    }
    return `
      <div class="timeline-event-item" data-obj-id="${a.obj_id}" title="Click to view ${objName}">
        <span class="timeline-event-time">${start}s - ${end}s</span>
        <span class="timeline-event-desc">${objName}: ${actionDesc}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="prop-section">
      <div class="prop-section-title">🎬 Scene Timeline</div>
      <div class="timeline-summary">
        <div class="timeline-header">
          <span>Animation Order</span>
          <span class="timeline-duration">Total: ${maxEnd.toFixed(1)}s</span>
        </div>
        <div class="timeline-events">
          ${itemsHtml}
        </div>
      </div>
    </div>
  `;
}

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
        <input class="prop-input" type="number" id="prop-scale" step="0.1"
               value="${(obj.scale !== undefined && obj.scale !== null) ? obj.scale : 1.0}" />
      </div>
    </div>

    ${getTimelineSummaryHtml()}

    <div class="prop-section">
      <div class="prop-section-title">Animations (${obj.id})</div>
      <div id="anim-list"></div>
      <button id="btn-add-anim">＋ Add animation step</button>
    </div>

    <button id="btn-delete-obj">🗑 Delete object</button>
  `;

  propsForm.innerHTML = html;
  renderAnimList(obj.id);

  // Wire up timeline click events
  propsForm.querySelectorAll('.timeline-event-item').forEach(el => {
    el.addEventListener('click', () => {
      const targetObjId = el.dataset.objId;
      if (targetObjId && targetObjId !== selectedId) selectObject(targetObjId);
    });
  });

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

  document.getElementById('prop-scale')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    obj.scale = isNaN(val) ? 1.0 : val;
    updateCanvasElement(obj);
  });

  document.getElementById('prop-x')?.addEventListener('input', (e) => {
    obj.position = [parseFloat(e.target.value), obj.position[1]];
    updateCanvasElement(obj);
  });
  document.getElementById('prop-y')?.addEventListener('input', (e) => {
    obj.position = [obj.position[0], parseFloat(e.target.value)];
    updateCanvasElement(obj);
  });

  document.getElementById('btn-add-anim')?.addEventListener('click', () => {
    const otherObjs = objects.filter(o => o.id !== obj.id);
    const defaultTarget = otherObjs.length > 0 ? otherObjs[0].id : '';
    const lastGlobalEnd = animations.length > 0
      ? Math.max(...animations.map(a => (a.start_time || 0) + (a.duration || 1.0)))
      : 0;

    animations.push({
      obj_id: obj.id,
      type: (obj.type === 'Text' || obj.type === 'MathTex') ? 'Write' : 'Create',
      duration: 1.0,
      start_time: parseFloat(lastGlobalEnd.toFixed(2)),
      target_id: defaultTarget,
      angle: 90.0,
    });
    renderPropsPanel();
  });

  document.getElementById('btn-delete-obj')?.addEventListener('click', () => {
    deleteObject(obj.id);
  });
}


function renderAnimList(objId) {
  const list = document.getElementById('anim-list');
  if (!list) return;

  const myAnims = animations.filter(a => a.obj_id === objId);
  const otherObjs = objects.filter(o => o.id !== objId);

  if (myAnims.length === 0) {
    list.innerHTML = `<p style="font-size:11px; color:var(--text-dim); text-align:center; padding: 8px 0;">No animations added yet for this object.</p>`;
    return;
  }

  list.innerHTML = myAnims.map((anim, idx) => {
    const globalIdx = animations.indexOf(anim);
    const typeOptions = ANIMATION_TYPES
      .map(t => `<option value="${t.value}" ${t.value === anim.type ? 'selected' : ''}>${t.label}</option>`)
      .join('');

    // Ensure valid target_id if Transform is selected
    if ((anim.type === 'Transform' || anim.type === 'ReplacementTransform')) {
      if (!anim.target_id || !objects.some(o => o.id === anim.target_id && o.id !== objId)) {
        anim.target_id = otherObjs.length > 0 ? otherObjs[0].id : '';
      }
    }

    const startTime = parseFloat((anim.start_time !== undefined ? anim.start_time : 0).toFixed(2));
    const dur = parseFloat((anim.duration !== undefined ? anim.duration : 1.0).toFixed(2));
    const endTime = parseFloat((startTime + dur).toFixed(2));

    return `
      <div class="anim-entry" data-anim-idx="${globalIdx}">
        <div class="anim-entry-header">
          <span class="anim-badge">#${idx + 1}</span>
          <span class="anim-timing-badge">⏱ ${startTime}s – ${endTime}s</span>
          <div class="anim-btn-group">
            <button class="anim-btn-icon anim-move-up" data-idx="${globalIdx}" title="Move earlier in sequence">▲</button>
            <button class="anim-btn-icon anim-move-down" data-idx="${globalIdx}" title="Move later in sequence">▼</button>
            <button class="anim-entry-remove" data-idx="${globalIdx}" title="Remove animation">✕</button>
          </div>
        </div>

        <div class="anim-field-group">
          <label class="anim-field-label">Animation Action</label>
          <select class="prop-select" data-anim-field="type" data-idx="${globalIdx}">
            ${typeOptions}
          </select>
        </div>

        <div class="anim-entry-row">
          <div class="anim-field-group">
            <label class="anim-field-label">Start Time (s)</label>
            <input class="prop-input" type="number" min="0" step="0.1"
                   value="${startTime}" data-anim-field="start_time" data-idx="${globalIdx}" />
          </div>
          <div class="anim-field-group">
            <label class="anim-field-label">Duration (s)</label>
            <input class="prop-input" type="number" min="0.1" step="0.1"
                   value="${dur}" data-anim-field="duration" data-idx="${globalIdx}" />
          </div>
        </div>

        <div class="anim-entry-row">
          <div class="anim-field-group">
            <label class="anim-field-label">Timing Helper</label>
            <select class="prop-select anim-timing-preset" data-idx="${globalIdx}">
              <option value="custom">🎯 Custom Start Time</option>
              <option value="after_prev">⏱ Start After Previous Step</option>
              <option value="with_prev">⚡ Start With Previous Step</option>
            </select>
          </div>
        </div>

        ${anim.type === 'Rotate' ? `
        <div class="anim-field-group">
          <label class="anim-field-label">Rotation Angle (°)</label>
          <input class="prop-input" type="number" step="15" value="${anim.angle || 90}"
                 data-anim-field="angle" data-idx="${globalIdx}" />
        </div>` : ''}

        ${(anim.type === 'Transform' || anim.type === 'ReplacementTransform') ? `
        <div class="anim-transform-box">
          <div class="anim-transform-label">
            <span>🔄 Morph into Target Shape:</span>
          </div>
          ${otherObjs.length > 0 ? `
          <select class="prop-select" data-anim-field="target_id" data-idx="${globalIdx}">
            ${otherObjs.map(o => `
              <option value="${o.id}" ${anim.target_id === o.id ? 'selected' : ''}>
                ${o.type} (${o.id}) - Color: ${o.color || '#fff'}
              </option>
            `).join('')}
          </select>
          ` : `
          <div style="font-size:11px; color:var(--yellow); padding: 4px 0;">
            ⚠️ Add another shape onto canvas to transform into!
          </div>
          `}
        </div>` : ''}
      </div>`;
  }).join('');

  // Wire up field inputs
  list.querySelectorAll('[data-anim-field]').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx   = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.animField;
      const val   = (field === 'type' || field === 'target_id') ? e.target.value : parseFloat(e.target.value);
      animations[idx][field] = val;
      renderPropsPanel();
    });
    el.addEventListener('input', (e) => {
      if (e.target.tagName === 'SELECT') return;
      const idx   = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.animField;
      const val   = parseFloat(e.target.value);
      if (!isNaN(val)) {
        animations[idx][field] = val;
      }
    });
  });

  // Wire up timing preset dropdown
  list.querySelectorAll('.anim-timing-preset').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const mode = e.target.value;
      if (mode === 'after_prev' && idx > 0) {
        const prev = animations[idx - 1];
        const newStart = parseFloat(((prev.start_time || 0) + (prev.duration || 1.0)).toFixed(2));
        animations[idx].start_time = newStart;
        renderPropsPanel();
      } else if (mode === 'with_prev' && idx > 0) {
        const prev = animations[idx - 1];
        animations[idx].start_time = parseFloat((prev.start_time || 0).toFixed(2));
        renderPropsPanel();
      }
    });
  });

  // Wire up reorder buttons
  list.querySelectorAll('.anim-move-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx > 0) {
        const temp = animations[idx];
        animations[idx] = animations[idx - 1];
        animations[idx - 1] = temp;
        renderPropsPanel();
      }
    });
  });

  list.querySelectorAll('.anim-move-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx < animations.length - 1) {
        const temp = animations[idx];
        animations[idx] = animations[idx + 1];
        animations[idx + 1] = temp;
        renderPropsPanel();
      }
    });
  });

  // Wire up remove buttons
  list.querySelectorAll('.anim-entry-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      animations.splice(idx, 1);
      renderPropsPanel();
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

  // Auto-add intro animation ONLY for objects that have NO animation AND are NOT a transform target
  const transformTargets = new Set(
    animations
      .filter(a => (a.type === 'Transform' || a.type === 'ReplacementTransform') && a.target_id)
      .map(a => a.target_id)
  );

  const objsWithNoAnim = objects.filter(o => !animations.find(a => a.obj_id === o.id) && !transformTargets.has(o.id));
  objsWithNoAnim.forEach((o, i) => {
    const introType = (o.type === 'Text' || o.type === 'MathTex') ? 'Write' : 'FadeIn';
    animations.push({
      obj_id: o.id,
      type: introType,
      duration: 1.0,
      start_time: parseFloat((i * 0.5).toFixed(2)),
    });
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
        if (data.detail.stderr) {
          const lines = data.detail.stderr.trim().split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.includes('GLib') && !l.includes('WARNING') && !l.startsWith('(process:'));
          const errLine = lines.slice().reverse().find(l => 
            l.toLowerCase().includes('error') || 
            l.toLowerCase().includes('exception') || 
            l.toLowerCase().includes('failed')
          );
          errMsg = errLine || (lines.length ? lines[lines.length - 1] : (data.detail.error || 'Render error'));
        } else {
          errMsg = data.detail.error || 'Render error';
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
    const msg = (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')))
      ? 'Backend server not running! Run "python server.py" in terminal.'
      : err.message;
    setStatus(`Error: ${msg}`, 'error');
    showToast(`Render failed: ${msg}`, 'error');
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
