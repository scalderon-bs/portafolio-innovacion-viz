// Data loading + parsing for the Botero Soto Innovation Portfolio dashboard.
// Reads two published Google Sheets CSVs (Historicos + the Score matrix) and
// merges them by Proyecto name into one array of normalized snapshot objects.

var DASHBOARD = window.DASHBOARD || {};
(function () {

  // "Publicar en la web" CSV URLs (Archivo > Compartir > Publicar en la web,
  // pick the tab, format = Valores separados por comas).
  DASHBOARD.CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQN1dyFsP65pZJCCvfqZvdIIohcECTGZ4UsZhhhg89d3cUKYfLMMaNXLW14zbh7igtpBy38nNWdj9YX/pub?gid=1245491392&single=true&output=csv'; // Historicos
  DASHBOARD.SCORE_MATRIX_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQN1dyFsP65pZJCCvfqZvdIIohcECTGZ4UsZhhhg89d3cUKYfLMMaNXLW14zbh7igtpBy38nNWdj9YX/pub?gid=1920074563&single=true&output=csv'; // Score matrix (Impacto/Riesgo/Esfuerzo)

  // Canonical field -> list of possible header spellings found in the sheet.
  var FIELD_ALIASES = {
    id: ['id'],
    proyecto: ['proyecto'],
    responsable: ['responsable'],
    area: ['área / cliente', 'area / cliente', 'área/cliente', 'area/cliente'],
    tipoImpacto: ['tipo de impacto'],
    etapa: ['etapa'],
    ajusteRiesgo: ['% ajuste al riesgo', 'ajuste al riesgo'],
    status: ['status', 'estado'],
    inversionOpex: ['inversión opex ($)', 'inversion opex ($)'],
    inversionCapex: ['inversión capex ($)', 'inversion capex ($)'],
    inversionTotal: ['inversión total ($)', 'inversion total ($)'],
    impactoEficiencia: ['impacto económico eficiencia operativa ($/año)', 'impacto economico eficiencia operativa ($/año)'],
    impactoIngresos: ['impacto económico aumento de ingresos ($/año)', 'impacto economico aumento de ingresos ($/año)'],
    impactoTotal: ['impacto económico total ($/año)', 'impacto economico total ($/año)'],
    beneficioAjustado: ['beneficio ajustado por riesgo ($)'],
    beneficioNeto: ['beneficio neto ($)'],
    roi: ['roi'],
    payback: ['payback (meses)', 'payback'],
    impactoReal: ['impacto económico real ($)', 'impacto economico real ($)'],
    score: ['score prioridad'],
    fechaInicio: ['fecha de inicio de proyecto', 'fecha de inicio'],
    fechaEntregaEst: ['fecha de entrega estimada'],
    fechaFinReal: ['fecha fin real'],
    desviacionFinDias: ['desviación fin (días)', 'desviacion fin (dias)'],
    avanceEsperado: ['avance esperado'],
    avanceReal: ['avance real'],
    desviacion: ['desviacion', 'desviación'],
    proximoHito: ['próximo hito / riesgo', 'proximo hito / riesgo'],
    sprint: ['sprint'],
    // Score-matrix-only columns
    impacto: ['impacto total'],
    riesgo: ['riesgo'],
    esfuerzo: ['esfuerzo'],
    scoreFinal: ['score final']
  };

  function normHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function buildHeaderMap(headerRow) {
    var normed = headerRow.map(normHeader);
    var map = {};
    Object.keys(FIELD_ALIASES).forEach(function (canon) {
      var aliases = FIELD_ALIASES[canon];
      for (var i = 0; i < normed.length; i++) {
        if (aliases.indexOf(normed[i]) !== -1) { map[canon] = i; return; }
      }
    });
    return map;
  }

  // Minimal RFC4180-ish CSV parser (handles quoted fields with commas/newlines).
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  }

  // Handles Spanish/Latin-locale numbers: "$13.908.200" (dot=thousands),
  // "198,3%" (comma=decimal), "(80,0%)" (parens=negative), "41487603,2"
  // (plain comma-decimal, no thousands sep), and "60,0 m" (trailing unit).
  function toNumber(v) {
    if (v == null) return null;
    var s = String(v).trim();
    if (s === '' || s === '-') return null;
    var neg = false;
    if (s.charAt(0) === '(' && s.charAt(s.length - 1) === ')') {
      neg = true;
      s = s.slice(1, -1);
    }
    s = s.replace(/[$%\s]/g, '').replace(/[a-zA-Z]/g, '');
    var hasComma = s.indexOf(',') !== -1;
    var hasDot = s.indexOf('.') !== -1;
    if (hasComma && hasDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      s = s.replace(',', '.');
    } else if (hasDot) {
      // In this sheet a lone dot always means a thousands separator.
      s = s.replace(/\./g, '');
    }
    var n = Number(s);
    if (isNaN(n)) return null;
    return neg ? -n : n;
  }

  function normalizeRow(rawRow, headerMap) {
    function get(canon) {
      var idx = headerMap[canon];
      return idx == null ? null : rawRow[idx];
    }
    function getNum(canon) { return toNumber(get(canon)); }
    // ROI/Desviacion are sometimes exported as explicit percent text ("198,3%")
    // and sometimes as a raw decimal ratio with no "%" sign ("1,982959923").
    // Only the latter needs scaling up into percentage units.
    function getPercent(canon) {
      var raw = get(canon);
      if (raw == null) return null;
      var hasPercentSign = String(raw).indexOf('%') !== -1;
      var n = toNumber(raw);
      if (n == null) return null;
      return hasPercentSign ? n : n * 100;
    }
    var proyecto = get('proyecto');
    if (!proyecto || !String(proyecto).trim()) return null;
    return {
      id: get('id'),
      proyecto: String(proyecto).trim(),
      responsable: (get('responsable') || '').trim(),
      area: (get('area') || '').trim(),
      tipoImpacto: (get('tipoImpacto') || '').trim(),
      etapa: (get('etapa') || '').trim(),
      status: (get('status') || '').trim(),
      inversionTotal: getNum('inversionTotal') || 0,
      impactoTotal: getNum('impactoTotal') || 0,
      beneficioAjustado: getNum('beneficioAjustado') || 0,
      beneficioNeto: getNum('beneficioNeto'),
      roi: getPercent('roi'),
      payback: getNum('payback'),
      score: getNum('score'),
      avanceEsperado: getNum('avanceEsperado'),
      avanceReal: getNum('avanceReal'),
      desviacion: getPercent('desviacion'),
      proximoHito: (get('proximoHito') || '').trim(),
      sprint: (get('sprint') || '').trim(),
      impacto: null,
      riesgo: null,
      esfuerzo: null
    };
  }

  // The sheet has a title row (and a blank spacer row, which parseCSV already
  // drops) above the real header, so scan for the row that actually contains
  // a "Proyecto" cell instead of assuming row 0 is the header.
  function findHeaderRow(rows) {
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      var normed = rows[i].map(normHeader);
      if (normed.indexOf('proyecto') !== -1) return i;
    }
    return 0;
  }

  function fetchCSV(url) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching ' + url);
        return r.text();
      })
      .then(parseCSV);
  }

  // Historicos rows have Desviacion/ROI as raw ratios (0.05, not 5) once the
  // sheet is unformatted past sprint 1's currency/percent text — detect and
  // normalize the *2x* scale problem (percent-as-ratio) is already handled
  // by the *100 above; this guard only prevents double-scaling values that
  // were already exported as e.g. "198,3%" (percent sign present).
  DASHBOARD.loadData = function (historicosUrl, scoreMatrixUrl) {
    var hUrl = historicosUrl || DASHBOARD.CSV_URL;
    var sUrl = scoreMatrixUrl || DASHBOARD.SCORE_MATRIX_URL;
    if (!hUrl) return Promise.reject(new Error('No Historicos CSV URL configured'));

    var historicosPromise = fetchCSV(hUrl).then(function (rows) {
      if (!rows.length) return { items: [], fieldsFound: {} };
      var headerIdx = findHeaderRow(rows);
      var headerMap = buildHeaderMap(rows[headerIdx]);
      var items = [];
      for (var i = headerIdx + 1; i < rows.length; i++) {
        var norm = normalizeRow(rows[i], headerMap);
        if (norm) items.push(norm);
      }
      return { items: items, fieldsFound: headerMap };
    });

    var scoreMatrixPromise = sUrl
      ? fetchCSV(sUrl).then(function (rows) {
        var byProyecto = {};
        if (!rows.length) return byProyecto;
        var headerIdx = findHeaderRow(rows);
        var headerMap = buildHeaderMap(rows[headerIdx]);
        for (var i = headerIdx + 1; i < rows.length; i++) {
          var row = rows[i];
          var proyecto = headerMap.proyecto != null ? row[headerMap.proyecto] : null;
          if (!proyecto || !String(proyecto).trim()) continue;
          byProyecto[String(proyecto).trim()] = {
            impacto: headerMap.impacto != null ? toNumber(row[headerMap.impacto]) : null,
            riesgo: headerMap.riesgo != null ? toNumber(row[headerMap.riesgo]) : null,
            esfuerzo: headerMap.esfuerzo != null ? toNumber(row[headerMap.esfuerzo]) : null
          };
        }
        return byProyecto;
      }).catch(function () { return {}; })
      : Promise.resolve({});

    return Promise.all([historicosPromise, scoreMatrixPromise]).then(function (results) {
      var historicos = results[0];
      var scoreByProyecto = results[1];
      var hasScoreMatrix = false;
      historicos.items.forEach(function (it) {
        var m = scoreByProyecto[it.proyecto];
        if (m) {
          it.impacto = m.impacto;
          it.riesgo = m.riesgo;
          it.esfuerzo = m.esfuerzo;
          hasScoreMatrix = true;
        }
      });
      if (hasScoreMatrix) {
        historicos.fieldsFound.impacto = true;
        historicos.fieldsFound.riesgo = true;
        historicos.fieldsFound.esfuerzo = true;
      }
      return historicos;
    });
  };

  window.DASHBOARD = DASHBOARD;
})();
