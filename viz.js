(function () {
  var STAGES = ['Oportunidad', 'Exploración', 'Desarrollo', 'Pruebas', 'Implementación', 'Seguimiento'];
  var STAGE_COLORS = {
    'Oportunidad': '#A9B6C0',
    'Exploración': '#F3C94F',
    'Desarrollo': '#4F8FD6',
    'Pruebas': '#3AA876',
    'Implementación': '#8A6FD8',
    'Seguimiento': '#E2645A'
  };

  var VB_W = 1000, VB_H = 320;
  var FUNNEL_X0 = 10, FUNNEL_X1 = 980;
  var TUBE_X0 = 850;
  var TOP_Y0 = 20, TOP_Y1 = 135;
  var BOT_Y0 = 300, BOT_Y1 = 185;
  var STAGE_BOUNDS = [10, 190, 350, 500, 630, 850, 980];
  var MIN_R = 6, MAX_R = 34;

  function normalizeStage(raw) {
    if (raw == null) return null;
    var t = String(raw).trim().toLowerCase();
    for (var i = 0; i < STAGES.length; i++) {
      if (STAGES[i].toLowerCase() === t) return STAGES[i];
    }
    return null;
  }

  function easeInQuad(t) { return t * t; }

  function topY(x) {
    if (x >= TUBE_X0) return TOP_Y1;
    var t = (x - FUNNEL_X0) / (TUBE_X0 - FUNNEL_X0);
    return TOP_Y0 + (TOP_Y1 - TOP_Y0) * easeInQuad(t);
  }

  function botY(x) {
    if (x >= TUBE_X0) return BOT_Y1;
    var t = (x - FUNNEL_X0) / (TUBE_X0 - FUNNEL_X0);
    return BOT_Y0 + (BOT_Y1 - BOT_Y0) * easeInQuad(t);
  }

  function buildFunnelPoints() {
    var pts = [];
    var n = 40;
    var i, x;
    for (i = 0; i <= n; i++) {
      x = FUNNEL_X0 + (FUNNEL_X1 - FUNNEL_X0) * (i / n);
      pts.push(x + ',' + topY(x));
    }
    for (i = n; i >= 0; i--) {
      x = FUNNEL_X0 + (FUNNEL_X1 - FUNNEL_X0) * (i / n);
      pts.push(x + ',' + botY(x));
    }
    return pts.join(' ');
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function fmtMoney(v) {
    if (v == null || isNaN(v)) return '-';
    return '$' + Math.round(v).toLocaleString('es-CO');
  }

  function radiusScaler(items) {
    var values = items.map(function (it) { return it.beneficio; });
    var maxB = values.length ? Math.max.apply(null, values) : 1;
    var minB = values.length ? Math.min.apply(null, values) : 0;
    return function (v) {
      if (maxB === minB) return (MIN_R + MAX_R) / 2;
      var t = Math.max(0, (v - minB) / (maxB - minB));
      return MIN_R + (MAX_R - MIN_R) * Math.sqrt(t);
    };
  }

  function placeBubbles(svg, stage, idx, list, radiusFor, tooltip) {
    var x0 = STAGE_BOUNDS[idx], x1 = STAGE_BOUNDS[idx + 1];
    var cx0 = x0 + (x1 - x0) * 0.18, cx1 = x1 - (x1 - x0) * 0.18;
    var colWidth = (cx1 - cx0) / 3;
    var placed = [];

    list.forEach(function (it, i) {
      var r = radiusFor(it.beneficio);
      var col = i % 3;
      var row = Math.floor(i / 3);
      var xTarget = cx0 + col * colWidth + colWidth / 2;
      var topAtX = topY(xTarget) + r + 4;
      var botAtX = Math.max(botY(xTarget) - r - 4, topAtX + 1);
      var bandH = botAtX - topAtX;
      var yTarget = topAtX + ((row % 5) / 4) * bandH;

      var cx = xTarget, cy = yTarget, attempt = 0;
      while (attempt < 12 && placed.some(function (p) {
        var dx = p.x - cx, dy = p.y - cy;
        return Math.sqrt(dx * dx + dy * dy) < (p.r + r + 2);
      })) {
        cy += r * 0.6;
        cx += (attempt % 2 === 0 ? 1 : -1) * r * 0.3;
        attempt++;
      }
      cy = Math.min(Math.max(cy, topY(cx) + r + 2), botY(cx) - r - 2);
      placed.push({ x: cx, y: cy, r: r });

      var circle = svgEl('circle', { cx: cx, cy: cy, r: r, fill: STAGE_COLORS[stage], class: 'bubble' });
      circle.addEventListener('mousemove', function (evt) {
        tooltip.style.display = 'block';
        tooltip.style.left = (evt.clientX + 12) + 'px';
        tooltip.style.top = (evt.clientY + 12) + 'px';
        tooltip.innerHTML = '<strong>' + it.proyecto + '</strong><br>' + stage + '<br>Beneficio ajustado: ' + fmtMoney(it.beneficio);
      });
      circle.addEventListener('mouseleave', function () { tooltip.style.display = 'none'; });
      svg.appendChild(circle);
    });
  }

  function draw(data) {
    var root = document.getElementById('embudo-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'embudo-root';
      root.className = 'embudo-container';
      document.body.appendChild(root);
    }
    root.innerHTML = '';

    var rows = (data.tables && data.tables.DEFAULT) || [];
    var items = rows.map(function (r) {
      var proyecto = r.proyecto && r.proyecto[0] != null ? String(r.proyecto[0]) : '(sin nombre)';
      var etapa = normalizeStage(r.etapa && r.etapa[0]);
      var beneficioRaw = r.beneficio && r.beneficio[0] != null ? Number(r.beneficio[0]) : 0;
      return { proyecto: proyecto, etapa: etapa, beneficio: isNaN(beneficioRaw) ? 0 : beneficioRaw };
    }).filter(function (it) { return it.etapa != null; });

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + VB_W + ' ' + VB_H,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'embudo-svg'
    });

    svg.appendChild(svgEl('polygon', { points: buildFunnelPoints(), class: 'funnel-shape' }));

    for (var i = 1; i < STAGE_BOUNDS.length - 1; i++) {
      var x = STAGE_BOUNDS[i];
      svg.appendChild(svgEl('line', { x1: x, y1: topY(x) - 4, x2: x, y2: botY(x) + 4, class: 'stage-divider' }));
    }

    var tooltip = document.createElement('div');
    tooltip.className = 'embudo-tooltip';
    tooltip.style.display = 'none';

    var byStage = {};
    STAGES.forEach(function (s) { byStage[s] = []; });
    items.forEach(function (it) { byStage[it.etapa].push(it); });

    var radiusFor = radiusScaler(items);

    STAGES.forEach(function (stage, idx) {
      var list = byStage[stage].slice().sort(function (a, b) { return b.beneficio - a.beneficio; });
      placeBubbles(svg, stage, idx, list, radiusFor, tooltip);

      var x0 = STAGE_BOUNDS[idx], x1 = STAGE_BOUNDS[idx + 1];
      var label = svgEl('text', { x: (x0 + x1) / 2, y: VB_H - 10, class: 'stage-label' });
      label.textContent = stage;
      svg.appendChild(label);
    });

    root.appendChild(svg);
    root.appendChild(tooltip);
  }

  dscc.subscribeToData(draw, { transform: dscc.objectTransform });
})();
