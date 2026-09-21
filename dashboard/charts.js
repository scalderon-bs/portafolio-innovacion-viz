// Lightweight, dependency-free SVG chart renderers for the dashboard.
// Every draw* function takes a container id, a plain-object array, and
// renders a fresh SVG into it (safe to call repeatedly on filter changes).

var DASHBOARD = window.DASHBOARD || {};
(function () {

  var PALETTE = ['#4F8FD6', '#3AA876', '#F3C94F', '#8A6FD8', '#E2645A', '#A9B6C0', '#E08A3C', '#5FBFB3'];

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function fmtMoney(v) {
    if (v == null || isNaN(v)) return '-';
    var abs = Math.abs(v);
    if (abs >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'k';
    return String(Math.round(v));
  }

  function showTip(tooltip, evt, html) {
    if (!tooltip) return;
    tooltip.style.display = 'block';
    tooltip.style.left = (evt.clientX + 12) + 'px';
    tooltip.style.top = (evt.clientY + 12) + 'px';
    tooltip.innerHTML = html;
  }
  function hideTip(tooltip) { if (tooltip) tooltip.style.display = 'none'; }

  function emptyState(root, msg) {
    root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:180px;color:#9aa4af;font-size:13px;">' + msg + '</div>';
  }

  // items: [{proyecto, esperado, real}] (0-100)
  DASHBOARD.drawAvance = function (containerId, items, tooltip) {
    var root = document.getElementById(containerId);
    root.innerHTML = '';
    if (!items.length) return emptyState(root, 'Sin datos de avance');

    var rowH = 34, gap = 6, padTop = 8, padBottom = 8, labelW = 130, barMaxW = 0;
    var w = 560;
    barMaxW = w - labelW - 60;
    var h = padTop + items.length * (rowH * 2 + gap) + padBottom;

    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'avance-svg' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';

    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:16px;font-size:11px;color:#4a5563;margin-bottom:6px;';
    legend.innerHTML = '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#B7C2CC;margin-right:4px;"></span>Esperado</span>' +
      '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#3AA876;margin-right:4px;"></span>Real (a tiempo)</span>' +
      '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E2645A;margin-right:4px;"></span>Real (atrasado)</span>';
    root.appendChild(legend);

    items.forEach(function (it, i) {
      var y0 = padTop + i * (rowH * 2 + gap);
      var esp = Math.max(0, Math.min(100, it.esperado || 0));
      var real = Math.max(0, Math.min(100, it.real || 0));

      var label = svgEl('text', { x: 0, y: y0 + rowH, 'font-size': 12, 'font-weight': 600, fill: '#2c3542' });
      label.textContent = it.proyecto;
      svg.appendChild(label);

      var barX = labelW;

      // esperado bar (muted)
      var bgEsp = svgEl('rect', { x: barX, y: y0, width: barMaxW, height: 12, rx: 4, fill: '#eef1f4' });
      svg.appendChild(bgEsp);
      var fgEsp = svgEl('rect', { x: barX, y: y0, width: barMaxW * esp / 100, height: 12, rx: 4, fill: '#B7C2CC' });
      svg.appendChild(fgEsp);
      var txtEsp = svgEl('text', { x: barX + barMaxW + 8, y: y0 + 10, 'font-size': 11, fill: '#6b7683' });
      txtEsp.textContent = Math.round(esp) + '%';
      svg.appendChild(txtEsp);

      // real bar (accent, color by on/off track)
      var color = real >= esp ? '#3AA876' : '#E2645A';
      var y1 = y0 + 16;
      var bgReal = svgEl('rect', { x: barX, y: y1, width: barMaxW, height: 12, rx: 4, fill: '#eef1f4' });
      svg.appendChild(bgReal);
      var fgReal = svgEl('rect', { x: barX, y: y1, width: barMaxW * real / 100, height: 12, rx: 4, fill: color });
      svg.appendChild(fgReal);
      var txtReal = svgEl('text', { x: barX + barMaxW + 8, y: y1 + 10, 'font-size': 11, fill: '#6b7683' });
      txtReal.textContent = Math.round(real) + '%';
      svg.appendChild(txtReal);

      [bgEsp, fgEsp, bgReal, fgReal].forEach(function (el) {
        el.addEventListener('mousemove', function (evt) {
          showTip(tooltip, evt, '<strong>' + it.proyecto + '</strong><br>Esperado: ' + Math.round(esp) + '%<br>Real: ' + Math.round(real) + '%');
        });
        el.addEventListener('mouseleave', function () { hideTip(tooltip); });
      });
    });

    root.appendChild(svg);
  };

  // items: [{proyecto, desviacion}] desviacion in % points, + = adelantado, - = atrasado
  DASHBOARD.drawDesviacion = function (containerId, items, tooltip) {
    var root = document.getElementById(containerId);
    root.innerHTML = '';
    if (!items.length) return emptyState(root, 'Sin datos de desviación');

    var maxAbs = Math.max(10, Math.max.apply(null, items.map(function (it) { return Math.abs(it.desviacion || 0); })));
    var w = 480, labelW = 110, valW = 50;
    var midW = w - labelW - valW;
    var midX = labelW + midW / 2;
    var rowH = 26, padTop = 30, padBottom = 8;
    var h = padTop + items.length * rowH + padBottom;

    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';

    var headY = 14;
    var txtA = svgEl('text', { x: labelW, y: headY, 'font-size': 10, fill: '#9aa4af', 'text-anchor': 'start' });
    txtA.textContent = 'ATRASADO';
    svg.appendChild(txtA);
    var txtP = svgEl('text', { x: midX, y: headY, 'font-size': 10, fill: '#9aa4af', 'text-anchor': 'middle' });
    txtP.textContent = 'SEGÚN PLAN';
    svg.appendChild(txtP);
    var txtD = svgEl('text', { x: labelW + midW, y: headY, 'font-size': 10, fill: '#9aa4af', 'text-anchor': 'end' });
    txtD.textContent = 'ADELANTADO';
    svg.appendChild(txtD);
    svg.appendChild(svgEl('line', { x1: midX, y1: headY + 6, x2: midX, y2: h - padBottom, stroke: '#d7dee4', 'stroke-width': 1, 'stroke-dasharray': '3,3' }));

    items.forEach(function (it, i) {
      var y = padTop + i * rowH;
      var label = svgEl('text', { x: 0, y: y + 14, 'font-size': 12, 'font-weight': 600, fill: '#2c3542' });
      label.textContent = it.proyecto;
      svg.appendChild(label);

      var d = it.desviacion || 0;
      var halfW = midW / 2;
      var barW = Math.min(halfW, Math.abs(d) / maxAbs * halfW);
      var color = d > 0.5 ? '#3AA876' : (d < -0.5 ? '#E2645A' : '#B7C2CC');
      var x = d >= 0 ? midX : midX - barW;
      var bar = svgEl('rect', { x: x, y: y + 3, width: Math.max(barW, 1), height: 14, rx: 3, fill: color });
      svg.appendChild(bar);

      var valTxt = svgEl('text', {
        x: labelW + midW + valW - 4, y: y + 14, 'font-size': 11, fill: '#2c3542', 'text-anchor': 'end', 'font-weight': 600
      });
      valTxt.textContent = (d > 0 ? '+' : '') + Math.round(d) + '%';
      svg.appendChild(valTxt);

      bar.addEventListener('mousemove', function (evt) {
        showTip(tooltip, evt, '<strong>' + it.proyecto + '</strong><br>Desviación: ' + (d > 0 ? '+' : '') + Math.round(d) + '%');
      });
      bar.addEventListener('mouseleave', function () { hideTip(tooltip); });
    });

    root.appendChild(svg);
  };

  // items: [{label, value}]
  DASHBOARD.drawDonut = function (containerId, items, centerLabel, tooltip) {
    var root = document.getElementById(containerId);
    root.innerHTML = '';
    var total = items.reduce(function (s, it) { return s + (it.value || 0); }, 0);
    if (!items.length || total <= 0) return emptyState(root, 'Sin datos');

    var w = 260, h = 200;
    var cx = 90, cy = h / 2, rOuter = 68, rInner = 42;
    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: '100%' });

    var angle = -Math.PI / 2;
    items.forEach(function (it, i) {
      var frac = (it.value || 0) / total;
      var a0 = angle;
      var a1 = angle + frac * Math.PI * 2;
      angle = a1;
      var largeArc = (a1 - a0) > Math.PI ? 1 : 0;
      var x0o = cx + rOuter * Math.cos(a0), y0o = cy + rOuter * Math.sin(a0);
      var x1o = cx + rOuter * Math.cos(a1), y1o = cy + rOuter * Math.sin(a1);
      var x0i = cx + rInner * Math.cos(a1), y0i = cy + rInner * Math.sin(a1);
      var x1i = cx + rInner * Math.cos(a0), y1i = cy + rInner * Math.sin(a0);
      var d = [
        'M', x0o, y0o,
        'A', rOuter, rOuter, 0, largeArc, 1, x1o, y1o,
        'L', x0i, y0i,
        'A', rInner, rInner, 0, largeArc, 0, x1i, y1i,
        'Z'
      ].join(' ');
      var path = svgEl('path', { d: d, fill: PALETTE[i % PALETTE.length] });
      svg.appendChild(path);
      path.addEventListener('mousemove', function (evt) {
        var pct = Math.round(frac * 1000) / 10;
        showTip(tooltip, evt, '<strong>' + it.label + '</strong><br>' + it.value + ' (' + pct + '%)');
      });
      path.addEventListener('mouseleave', function () { hideTip(tooltip); });
    });

    var centerNum = svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: '#2c3542' });
    centerNum.textContent = total;
    svg.appendChild(centerNum);
    var centerTxt = svgEl('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#6b7683' });
    centerTxt.textContent = centerLabel || 'proyectos';
    svg.appendChild(centerTxt);

    root.appendChild(svg);

    var legend = document.createElement('div');
    legend.style.cssText = 'position:relative;margin-top:-' + h + 'px;margin-left:190px;width:70px;font-size:11px;';
    items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:3px;';
      row.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:' + PALETTE[i % PALETTE.length] + ';display:inline-block;flex:none;"></span><span style="color:#4a5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + it.label + '</span>';
      legend.appendChild(row);
    });
    root.style.position = 'relative';
    root.appendChild(legend);
  };

  // items: [{proyecto, inversion, beneficio}]
  DASHBOARD.drawInvBenef = function (containerId, items, tooltip) {
    var root = document.getElementById(containerId);
    root.innerHTML = '';
    if (!items.length) return emptyState(root, 'Sin datos');

    var w = 620, h = 240, padL = 50, padB = 40, padT = 10, padR = 10;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var maxVal = Math.max.apply(null, items.map(function (it) { return Math.max(it.inversion || 0, it.beneficio || 0); })) || 1;

    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: '100%' });

    // y axis gridlines
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var val = maxVal * t / ticks;
      var y = padT + chartH - (chartH * t / ticks);
      svg.appendChild(svgEl('line', { x1: padL, y1: y, x2: w - padR, y2: y, stroke: '#eef1f4', 'stroke-width': 1 }));
      var lab = svgEl('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', 'font-size': 10, fill: '#9aa4af' });
      lab.textContent = fmtMoney(val);
      svg.appendChild(lab);
    }

    var groupW = chartW / items.length;
    var barW = Math.min(24, groupW * 0.32);

    items.forEach(function (it, i) {
      var gx = padL + i * groupW + groupW / 2;
      var invH = chartH * (it.inversion || 0) / maxVal;
      var benH = chartH * (it.beneficio || 0) / maxVal;

      var invBar = svgEl('rect', {
        x: gx - barW - 2, y: padT + chartH - invH, width: barW, height: Math.max(invH, 0), fill: '#4F8FD6', rx: 2
      });
      var benBar = svgEl('rect', {
        x: gx + 2, y: padT + chartH - benH, width: barW, height: Math.max(benH, 0), fill: '#3AA876', rx: 2
      });
      svg.appendChild(invBar);
      svg.appendChild(benBar);

      [invBar, benBar].forEach(function (el) {
        el.addEventListener('mousemove', function (evt) {
          showTip(tooltip, evt, '<strong>' + it.proyecto + '</strong><br>Inversión: ' + fmtMoney(it.inversion) + '<br>Beneficio neto: ' + fmtMoney(it.beneficio));
        });
        el.addEventListener('mouseleave', function () { hideTip(tooltip); });
      });

      var lab = svgEl('text', { x: gx, y: h - padB + 14, 'text-anchor': 'middle', 'font-size': 10, fill: '#6b7683' });
      lab.textContent = it.proyecto.length > 12 ? it.proyecto.slice(0, 11) + '…' : it.proyecto;
      svg.appendChild(lab);
    });

    root.appendChild(svg);

    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:16px;font-size:11px;color:#4a5563;margin-top:6px;';
    legend.innerHTML = '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#4F8FD6;margin-right:4px;"></span>Inversión</span>' +
      '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#3AA876;margin-right:4px;"></span>Beneficio neto</span>';
    root.appendChild(legend);
  };

  // items: [{proyecto, roi, payback}]
  DASHBOARD.drawScatter = function (containerId, items, tooltip) {
    var root = document.getElementById(containerId);
    root.innerHTML = '';
    var pts = items.filter(function (it) { return it.roi != null && it.payback != null; });
    if (!pts.length) return emptyState(root, 'Sin datos de ROI/Payback');

    var w = 320, h = 240, padL = 44, padB = 34, padT = 14, padR = 14;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var maxX = Math.max.apply(null, pts.map(function (p) { return p.payback; })) * 1.15 || 1;
    var maxY = Math.max.apply(null, pts.map(function (p) { return p.roi; })) * 1.15 || 1;

    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: '100%' });

    svg.appendChild(svgEl('line', { x1: padL, y1: padT, x2: padL, y2: padT + chartH, stroke: '#d7dee4', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: padL, y1: padT + chartH, x2: padL + chartW, y2: padT + chartH, stroke: '#d7dee4', 'stroke-width': 1 }));

    var yLab = svgEl('text', { x: padL, y: padT - 4, 'font-size': 10, fill: '#9aa4af' });
    yLab.textContent = 'ROI %';
    svg.appendChild(yLab);
    var xLab = svgEl('text', { x: padL + chartW, y: h - 8, 'text-anchor': 'end', 'font-size': 10, fill: '#9aa4af' });
    xLab.textContent = 'Payback (meses)';
    svg.appendChild(xLab);

    pts.forEach(function (p) {
      var x = padL + chartW * (p.payback / maxX);
      var y = padT + chartH - chartH * (p.roi / maxY);
      var dot = svgEl('circle', { cx: x, cy: y, r: 5, fill: '#4F8FD6', 'fill-opacity': 0.85, stroke: '#fff', 'stroke-width': 1 });
      svg.appendChild(dot);
      dot.addEventListener('mousemove', function (evt) {
        showTip(tooltip, evt, '<strong>' + p.proyecto + '</strong><br>ROI: ' + Math.round(p.roi) + '%<br>Payback: ' + Math.round(p.payback) + ' meses');
      });
      dot.addEventListener('mouseleave', function () { hideTip(tooltip); });
    });

    root.appendChild(svg);
  };

  window.DASHBOARD = DASHBOARD;
})();
