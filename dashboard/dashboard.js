// Orchestrator: loads data, wires filters, and re-renders every section
// whenever the filter selection changes.

(function () {
  var ALL_ITEMS = [];
  var tooltip = document.getElementById('tooltip');

  var SCORE_BANDS = [
    { min: 80, color: '#3AA876' },
    { min: 65, color: '#F3C94F' },
    { min: 45, color: '#E08A3C' },
    { min: -Infinity, color: '#E2645A' }
  ];
  function scoreColor(score) {
    if (score == null) return '#A9B6C0';
    for (var i = 0; i < SCORE_BANDS.length; i++) {
      if (score >= SCORE_BANDS[i].min) return SCORE_BANDS[i].color;
    }
    return '#A9B6C0';
  }

  function isFinalizado(status) {
    var s = (status || '').toLowerCase();
    return s.indexOf('final') !== -1 || s.indexOf('terminad') !== -1 || s.indexOf('cerrad') !== -1;
  }

  function fmtMoney(v) {
    if (v == null || isNaN(v)) return '-';
    return '$' + (v / 1e6).toFixed(1).replace('.0', '') + 'M';
  }

  function uniqueSorted(arr) {
    var seen = {};
    var out = [];
    arr.forEach(function (v) {
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out.sort();
  }

  function populateSelect(selectEl, values, current) {
    var existing = Array.prototype.slice.call(selectEl.options).map(function (o) { return o.value; });
    values.forEach(function (v) {
      if (existing.indexOf(v) === -1) {
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
      }
    });
    if (current) selectEl.value = current;
  }

  function currentFilters() {
    return {
      sprint: document.getElementById('f-sprint').value,
      etapa: document.getElementById('f-etapa').value,
      proyecto: document.getElementById('f-proyecto').value,
      estado: document.getElementById('f-estado').value,
      area: document.getElementById('f-area').value
    };
  }

  function applyFilters(items, f) {
    return items.filter(function (it) {
      if (f.sprint && it.sprint !== f.sprint) return false;
      if (f.etapa && it.etapa !== f.etapa) return false;
      if (f.proyecto && it.proyecto !== f.proyecto) return false;
      if (f.estado && it.status !== f.estado) return false;
      if (f.area && it.area !== f.area) return false;
      return true;
    });
  }

  function latestSprint(items) {
    var sprints = uniqueSorted(items.map(function (it) { return it.sprint; }));
    var numeric = sprints
      .map(function (s) { return { raw: s, n: parseFloat(String(s).replace(/[^0-9.\-]/g, '')) }; })
      .filter(function (o) { return !isNaN(o.n); });
    if (numeric.length) {
      numeric.sort(function (a, b) { return b.n - a.n; });
      return numeric[0].raw;
    }
    return sprints.length ? sprints[sprints.length - 1] : '';
  }

  function renderKPIs(items) {
    var cantidad = items.length;
    var finalizados = items.filter(function (it) { return isFinalizado(it.status); }).length;
    var inversion = items.reduce(function (s, it) { return s + (it.inversionTotal || 0); }, 0);
    var impacto = items.reduce(function (s, it) { return s + (it.impactoTotal || 0); }, 0);

    document.getElementById('kpi-cantidad').textContent = cantidad;
    document.getElementById('kpi-finalizados').textContent = finalizados;
    document.getElementById('kpi-inversion').textContent = fmtMoney(inversion);
    document.getElementById('kpi-impacto').textContent = fmtMoney(impacto);
  }

  function renderScoreTable(items, fieldsFound) {
    var hasIRE = fieldsFound.impacto != null && fieldsFound.riesgo != null && fieldsFound.esfuerzo != null;
    var head = document.getElementById('score-table-head');
    var body = document.getElementById('score-table-body');

    var cols = ['Proyecto', 'Score'];
    if (hasIRE) cols = cols.concat(['Impacto', 'Riesgo', 'Esfuerzo']);
    cols.push('Estado');

    head.innerHTML = cols.map(function (c) { return '<th>' + c + '</th>'; }).join('');

    var sorted = items.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });

    body.innerHTML = sorted.map(function (it) {
      var cells = [
        '<td>' + it.proyecto + '</td>',
        '<td><span class="score-badge" style="background:' + scoreColor(it.score) + '">' + (it.score != null ? Math.round(it.score) : '-') + '</span></td>'
      ];
      if (hasIRE) {
        cells.push('<td>' + (it.impacto != null ? it.impacto : '-') + '</td>');
        cells.push('<td>' + (it.riesgo != null ? it.riesgo : '-') + '</td>');
        cells.push('<td>' + (it.esfuerzo != null ? it.esfuerzo : '-') + '</td>');
      }
      cells.push('<td>' + (it.etapa || it.status || '-') + '</td>');
      return '<tr>' + cells.join('') + '</tr>';
    }).join('');

    if (!hasIRE) {
      var note = document.getElementById('footer-note');
      note.textContent = (note.textContent ? note.textContent + ' · ' : '') +
        'Columnas Impacto/Riesgo/Esfuerzo no están en la hoja Historicos — se omiten en la tabla de score.';
    }
  }

  function renderAll(fieldsFound) {
    var f = currentFilters();
    var items = applyFilters(ALL_ITEMS, f);

    renderKPIs(items);
    renderScoreTable(items, fieldsFound);

    DASHBOARD.drawFunnel('embudo-root', items.map(function (it) {
      return { proyecto: it.proyecto, etapa: it.etapa, beneficio: it.beneficioAjustado };
    }), tooltip);

    DASHBOARD.drawAvance('avance-root', items
      .filter(function (it) { return it.avanceEsperado != null || it.avanceReal != null; })
      .map(function (it) { return { proyecto: it.proyecto, esperado: it.avanceEsperado || 0, real: it.avanceReal || 0 }; }),
      tooltip);

    DASHBOARD.drawDesviacion('desviacion-root', items
      .filter(function (it) { return it.desviacion != null; })
      .map(function (it) { return { proyecto: it.proyecto, desviacion: it.desviacion }; }),
      tooltip);

    var byTipo = {};
    items.forEach(function (it) {
      var k = it.tipoImpacto || 'Otros';
      byTipo[k] = (byTipo[k] || 0) + 1;
    });
    DASHBOARD.drawDonut('donut-tipo', Object.keys(byTipo).map(function (k) { return { label: k, value: byTipo[k] }; }), 'proyectos', tooltip);

    var byArea = {};
    items.forEach(function (it) {
      var k = it.area || 'Otros';
      byArea[k] = (byArea[k] || 0) + 1;
    });
    DASHBOARD.drawDonut('donut-area', Object.keys(byArea).map(function (k) { return { label: k, value: byArea[k] }; }), 'proyectos', tooltip);

    DASHBOARD.drawInvBenef('invbenef-root', items.map(function (it) {
      return { proyecto: it.proyecto, inversion: it.inversionTotal, beneficio: it.beneficioNeto };
    }), tooltip);

    DASHBOARD.drawScatter('scatter-root', items.map(function (it) {
      return { proyecto: it.proyecto, roi: it.roi, payback: it.payback };
    }), tooltip);
  }

  function wireFilters(fieldsFound) {
    ['f-sprint', 'f-etapa', 'f-proyecto', 'f-estado', 'f-area'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () { renderAll(fieldsFound); });
    });
  }

  function init() {
    var url = DASHBOARD.CSV_URL || window.DASHBOARD_CSV_URL;
    if (!url) {
      document.getElementById('footer-note').textContent =
        'Falta configurar la URL del CSV publicado (DASHBOARD.CSV_URL en data.js).';
      return;
    }
    DASHBOARD.loadData(url).then(function (result) {
      ALL_ITEMS = result.items;
      if (!ALL_ITEMS.length) {
        document.getElementById('footer-note').textContent = 'No se encontraron filas de proyectos en el CSV.';
        return;
      }
      populateSelect(document.getElementById('f-sprint'), uniqueSorted(ALL_ITEMS.map(function (it) { return it.sprint; })));
      populateSelect(document.getElementById('f-etapa'), uniqueSorted(ALL_ITEMS.map(function (it) { return it.etapa; })));
      populateSelect(document.getElementById('f-proyecto'), uniqueSorted(ALL_ITEMS.map(function (it) { return it.proyecto; })));
      populateSelect(document.getElementById('f-estado'), uniqueSorted(ALL_ITEMS.map(function (it) { return it.status; })));
      populateSelect(document.getElementById('f-area'), uniqueSorted(ALL_ITEMS.map(function (it) { return it.area; })));

      var latest = latestSprint(ALL_ITEMS);
      if (latest) document.getElementById('f-sprint').value = latest;

      wireFilters(result.fieldsFound);
      renderAll(result.fieldsFound);

      document.getElementById('footer-note').textContent =
        'Última actualización: ' + new Date().toLocaleString('es-CO') + ' · Sprint mostrado: ' + (latest || 'todos');
    }).catch(function (err) {
      document.getElementById('footer-note').textContent = 'Error cargando datos: ' + err.message;
      console.error(err);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
