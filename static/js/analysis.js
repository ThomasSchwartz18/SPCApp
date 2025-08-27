window.addEventListener('DOMContentLoaded', () => {
  // Control Chart settings toggle
  const chartBtn = document.getElementById('control-chart-btn');
  const settings = document.getElementById('chart-settings');
  if (chartBtn && settings) {
    chartBtn.addEventListener('click', () => {
      settings.style.display = settings.style.display === 'none' ? 'block' : 'none';
    });
  }
  const ngChartBtn = document.getElementById('control-chart-ng-btn');
  const ngSettings = document.getElementById('chart-ng-settings');
  if (ngChartBtn && ngSettings) {
    ngChartBtn.addEventListener('click', () => {
      ngSettings.style.display = ngSettings.style.display === 'none' ? 'block' : 'none';
    });
  }
  const stdBtn = document.getElementById('stddev-chart-btn');
  const stdSettings = document.getElementById('stddev-chart-settings');
  if (stdBtn && stdSettings) {
    stdBtn.addEventListener('click', () => {
      stdSettings.style.display = stdSettings.style.display === 'none' ? 'block' : 'none';
    });
  }

  const ngStdBtn = document.getElementById('ng-stddev-chart-btn');
  const ngStdSettings = document.getElementById('ng-stddev-chart-settings');
  if (ngStdBtn && ngStdSettings) {
    ngStdBtn.addEventListener('click', () => {
      ngStdSettings.style.display = ngStdSettings.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Model filter for MOAT table
  const modelFilterBtns = document.querySelectorAll('.model-filter-btn');
  if (modelFilterBtns.length) {
    function applyModelFilter(value) {
      const rows = document.querySelectorAll('#moat-table tbody tr');
      rows.forEach(row => {
        const name = row.cells[0].textContent.toUpperCase();
        const show =
          value === 'all' ||
          (value === 'smt' && name.includes('SMT')) ||
          (value === 'th' && name.includes('TH'));
        row.style.display = show ? '' : 'none';
      });
    }
    modelFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modelFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyModelFilter(btn.dataset.filter);
      });
    });
    applyModelFilter('all');
  }

  const refreshBtn = document.getElementById('ppm-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const tokenEl = document.querySelector('input[name=csrf_token]');
      const headers = { 'Content-Type': 'application/json' };
      if (tokenEl) headers['X-CSRFToken'] = tokenEl.value;
      fetch('/analysis/refresh', { method: 'POST', headers })
        .then(r => r.json())
        .then(data => {
          alert(data.message);
          if (data.message && data.message.startsWith('Imported')) {
            window.location.reload();
          }
        });
    });
  }

  function setupLineSelectors(prefix) {
    const selects = [];
    const ands = [];
    for (let i = 1; i <= 4; i++) {
      selects[i] = document.getElementById(`${prefix}-select-${i}`);
      if (i > 1) ands[i] = document.getElementById(`${prefix}-and-${i}`);
    }

    function hideFrom(start) {
      for (let i = start; i <= 4; i++) {
        if (selects[i]) {
          selects[i].style.display = 'none';
          selects[i].value = '';
        }
        if (ands[i]) ands[i].style.display = 'none';
      }
    }

    selects[1]?.addEventListener('change', () => {
      if (selects[1].value && selects[1].value !== 'all') {
        if (selects[2]) {
          selects[2].style.display = 'inline';
          ands[2].style.display = 'inline';
        }
      } else {
        hideFrom(2);
      }
    });
    selects[2]?.addEventListener('change', () => {
      if (selects[2].value) {
        if (selects[3]) {
          selects[3].style.display = 'inline';
          ands[3].style.display = 'inline';
        }
      } else {
        hideFrom(3);
      }
    });
    selects[3]?.addEventListener('change', () => {
      if (selects[3].value) {
        if (selects[4]) {
          selects[4].style.display = 'inline';
          ands[4].style.display = 'inline';
        }
      } else {
        hideFrom(4);
      }
    });
  }

  function getSelectedLines(prefix) {
    const values = [];
    const labels = [];
    for (let i = 1; i <= 4; i++) {
      const sel = document.getElementById(`${prefix}-select-${i}`);
      if (sel && sel.style.display !== 'none' && sel.value && sel.value !== 'all') {
        values.push(sel.value === 'offline' ? 'LOffline' : `L${sel.value}`);
        labels.push(sel.options[sel.selectedIndex].text);
      }
    }
    return {
      query: values.length ? `&lines=${values.join(',')}` : '',
      text: labels.length ? labels.join(', ') : 'All Lines'
    };
  }

  setupLineSelectors('line');
  setupLineSelectors('ng-line');
  setupLineSelectors('std-line');
  setupLineSelectors('ng-std-line');

  function setupModelInputs(prefix) {
    const inputs = [];
    const ands = [];
    for (let i = 1; i <= 4; i++) {
      inputs[i] = document.getElementById(`${prefix}-${i}`);
      if (i > 1) ands[i] = document.getElementById(`${prefix}-and-${i}`);
    }

    function hideFrom(start) {
      for (let i = start; i <= 4; i++) {
        if (inputs[i]) {
          inputs[i].style.display = 'none';
          inputs[i].value = '';
        }
        if (ands[i]) ands[i].style.display = 'none';
      }
    }

    inputs[1]?.addEventListener('input', () => {
      if (inputs[1].value) {
        if (inputs[2]) {
          inputs[2].style.display = 'inline';
          ands[2].style.display = 'inline';
        }
      } else {
        hideFrom(2);
      }
    });
    inputs[2]?.addEventListener('input', () => {
      if (inputs[2].value) {
        if (inputs[3]) {
          inputs[3].style.display = 'inline';
          ands[3].style.display = 'inline';
        }
      } else {
        hideFrom(3);
      }
    });
    inputs[3]?.addEventListener('input', () => {
      if (inputs[3].value) {
        if (inputs[4]) {
          inputs[4].style.display = 'inline';
          ands[4].style.display = 'inline';
        }
      } else {
        hideFrom(4);
      }
    });
  }

  function getSelectedModels(prefix) {
    const values = [];
    for (let i = 1; i <= 4; i++) {
      const inp = document.getElementById(`${prefix}-${i}`);
      if (inp && inp.style.display !== 'none' && inp.value.trim()) {
        values.push(inp.value.trim());
      }
    }
    return values;
  }

  setupModelInputs('model-name');
  setupModelInputs('ng-model-name');
  setupModelInputs('std-model-name');
  setupModelInputs('ng-std-model-name');

  // Threshold plugin for horizontal lines
  const thresholdPlugin = {
    id: 'thresholdPlugin',
    afterDraw: (chart, args, options) => {
      const {ctx, chartArea: {left, right}, scales: {y}} = chart;
      ctx.save();
      if (options.red) {
        const yPos = y.getPixelForValue(options.red.value);
        ctx.strokeStyle = options.red.color;
        ctx.beginPath();
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();
      }
      if (options.orange) {
        const yPos = y.getPixelForValue(options.orange.value);
        ctx.strokeStyle = options.orange.color;
        ctx.beginPath();
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();
      }
      if (options.green) {
        const yPos = y.getPixelForValue(options.green.value);
        ctx.strokeStyle = options.green.color;
        ctx.beginPath();
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  // FC Chart modal logic
  const runBtn = document.getElementById('run-chart-btn');
  const chartModalEl = document.getElementById('chart-modal');
  const chartModal = chartModalEl ? new bootstrap.Modal(chartModalEl) : null;
  const ctx = document.getElementById('chart-canvas');
  const downloadFcBtn = document.getElementById('download-fc-pdf');
  let chartInstance;

  if (runBtn && chartModal && ctx) {
    runBtn.addEventListener('click', () => {
      const start = document.getElementById('start-date').value;
      const end = document.getElementById('end-date').value;
      const yMax = parseFloat(document.getElementById('y-max').value) || 1;
      const threshold = parseInt(document.getElementById('min-boards').value) || 0;
      const models = getSelectedModels('model-name');
      const modelQuery = models.length ? `&models=${encodeURIComponent(models.join(','))}` : '';
      const filter = modelFilter ? modelFilter.value : 'all';
      const filterQuery = filter !== 'all' ? `&model_filter=${filter}` : '';
      const { query: lineQuery, text: lineText } = getSelectedLines('line');
      fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}&metric=fc${lineQuery}${modelQuery}${filterQuery}`)
        .then(res => res.json())
        .then(data => {
          const labels = data.map(d => `${d.report_date} ${d.model}`);
          const inRangeValues = data.map(d => (d.rate <= yMax ? d.rate : null));
          const outliers = data.filter(d => d.rate > yMax);
          if (chartInstance) chartInstance.destroy();
          const chartType = labels.length === 1 ? 'bar' : 'line';
          const mainDataset = chartType === 'bar' ? {
            label: 'FalseCall Rate',
            data: inRangeValues,
            backgroundColor: 'black',
            borderColor: 'black',
            borderWidth: 1
          } : {
            label: 'FalseCall Rate',
            data: inRangeValues,
            borderColor: 'black',
            pointBackgroundColor: 'black',
            pointBorderColor: 'black',
            fill: false,
            tension: 0,
            borderWidth: 1,
            clip: false
          };
          chartInstance = new Chart(ctx, {
            type: chartType,
            data: {
              labels,
              datasets: [
                mainDataset,
                {
                  type: 'scatter',
                  label: 'Outliers',
                  data: outliers.map(d => ({ x: `${d.report_date} ${d.model}`, y: yMax, real: d.rate })),
                  borderColor: 'red',
                  pointBackgroundColor: 'red',
                  pointBorderColor: 'red',
                  showLine: false,
                  pointStyle: 'triangle',
                  rotation: 180,
                  clip: false
                }
              ]
            },
            options: {
              layout: { padding: { top: 20 } },
              scales: { y: { beginAtZero: true, max: yMax } },
              plugins: {
                thresholdPlugin: { red: { value: 20, color: 'red' }, orange: { value: 10, color: 'orange' }, green: { value: 5, color: 'green'} },
                tooltip: {
                  callbacks: {
                    label: ctx => {
                      if (ctx.dataset.label === 'Outliers') {
                        return `${ctx.label}: ${ctx.raw.real}`;
                      }
                      return `${ctx.dataset.label}: ${ctx.parsed.y}`;
                    }
                  }
                }
              }
            },
            plugins: [thresholdPlugin]
          });
          const fcTable = document.getElementById('fc-data-table');
          if (fcTable) {
            fcTable.innerHTML = '<thead><tr><th>Model Name</th><th>Avg FalseCall Rate</th><th>Total Boards</th></tr></thead><tbody></tbody>';
            const tbody = fcTable.querySelector('tbody');
            data.forEach(row => {
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${row.model}</td><td>${row.rate.toFixed(2)}</td><td>${row.boards}</td>`;
              if (row.rate > 20) tr.classList.add('threshold-red');
              else if (row.rate > 10) tr.classList.add('threshold-yellow');
              tbody.appendChild(tr);
            });
          }
          const entryCount = data.length;
          const totalBoards = data.reduce((sum, r) => sum + r.boards, 0);
          const totalFalseCalls = data.reduce((sum, r) => sum + r.rate * r.boards, 0);
          const avgRate = totalBoards ? totalFalseCalls / totalBoards : 0;
          const rangeText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          const summary = `From ${rangeText} on ${lineText}, ${entryCount} models (${totalBoards} boards) averaged a false call rate of ${avgRate.toFixed(2)}.`;
          document.getElementById('fc-chart-summary').textContent = summary;
          chartModal.show();
        });
    });
  }

  if (downloadFcBtn) {
    downloadFcBtn.addEventListener('click', () => {
      if (!chartInstance) return;
      const summary = document.getElementById('fc-chart-summary').textContent;
      const margin = parseFloat(document.getElementById('fc-margin').value) || 0.5;
      exportChartWithTable(
        chartInstance,
        '#fc-data-table',
        ['Control Chart - Avg FalseCall Rate', summary],
        'fc-control-chart.pdf',
        'landscape',
        margin
      );
    });
  }

  // NG Chart modal logic
  const runNgBtn = document.getElementById('run-ng-chart-btn');
  const chartNgModalEl = document.getElementById('chart-ng-modal');
  const chartNgModal = chartNgModalEl ? new bootstrap.Modal(chartNgModalEl) : null;
  const ngCtx = document.getElementById('chart-ng-canvas');
  const downloadNgBtn = document.getElementById('download-ng-pdf');
  let ngChartInstance;

  if (runNgBtn && chartNgModal && ngCtx) {
    runNgBtn.addEventListener('click', () => {
      const start = document.getElementById('ng-start-date').value;
      const end = document.getElementById('ng-end-date').value;
      const yMax = parseFloat(document.getElementById('ng-y-max').value) || 1;
      const threshold = parseInt(document.getElementById('ng-min-boards').value) || 0;
      const models = getSelectedModels('ng-model-name');
      const modelQuery = models.length ? `&models=${encodeURIComponent(models.join(','))}` : '';
      const filter = modelFilter ? modelFilter.value : 'all';
      const filterQuery = filter !== 'all' ? `&model_filter=${filter}` : '';
      const { query: lineQuery, text: lineText } = getSelectedLines('ng-line');
      fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}&metric=ng${lineQuery}${modelQuery}${filterQuery}`)
        .then(res => res.json())
        .then(data => {
          const labels = data.map(d => `${d.report_date} ${d.model}`);
          const inRangeValues = data.map(d => (d.rate <= yMax ? d.rate : null));
          const outliers = data.filter(d => d.rate > yMax);
          if (ngChartInstance) ngChartInstance.destroy();
          const chartType = labels.length === 1 ? 'bar' : 'line';
          const mainDataset = chartType === 'bar' ? {
            label: 'NG Rate',
            data: inRangeValues,
            backgroundColor: 'black',
            borderColor: 'black',
            borderWidth: 1
          } : {
            label: 'NG Rate',
            data: inRangeValues,
            borderColor: 'black',
            pointBackgroundColor: 'black',
            pointBorderColor: 'black',
            fill: false,
            tension: 0,
            borderWidth: 1,
            clip: false
          };
          ngChartInstance = new Chart(ngCtx, {
            type: chartType,
            data: {
              labels,
              datasets: [
                mainDataset,
                {
                  type: 'scatter',
                  label: 'Outliers',
                  data: outliers.map(d => ({ x: `${d.report_date} ${d.model}`, y: yMax, real: d.rate })),
                  borderColor: 'red',
                  pointBackgroundColor: 'red',
                  pointBorderColor: 'red',
                  showLine: false,
                  pointStyle: 'triangle',
                  rotation: 180,
                  clip: false
                }
              ]
            },
            options: {
              layout: { padding: { top: 20 } },
              scales: { y: { beginAtZero: true, max: yMax } },
              plugins: {
                thresholdPlugin: { red: { value: 0.1, color: 'red' }, orange: { value: 0.05, color: 'orange' } },
                tooltip: {
                  callbacks: {
                    label: ctx => {
                      if (ctx.dataset.label === 'Outliers') {
                        return `${ctx.label}: ${ctx.raw.real}`;
                      }
                      return `${ctx.dataset.label}: ${ctx.parsed.y}`;
                    }
                  }
                }
              }
            },
            plugins: [thresholdPlugin]
          });
          const ngTable = document.getElementById('ng-data-table');
          if (ngTable) {
            ngTable.innerHTML = '<thead><tr><th>Model Name</th><th>Avg NG Rate</th><th>Total Boards</th></tr></thead><tbody></tbody>';
            const tbody = ngTable.querySelector('tbody');
            data.forEach(row => {
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${row.model}</td><td>${row.rate.toFixed(3)}</td><td>${row.boards}</td>`;
              if (row.rate > 0.1) tr.classList.add('threshold-red');
              else if (row.rate > 0.05) tr.classList.add('threshold-yellow');
              tbody.appendChild(tr);
            });
          }
          const entryCount = data.length;
          const totalBoards = data.reduce((sum, r) => sum + r.boards, 0);
          const totalNg = data.reduce((sum, r) => sum + r.rate * r.boards, 0);
          const avgRate = totalBoards ? totalNg / totalBoards : 0;
          const rangeText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          const summary = `From ${rangeText} on ${lineText}, ${entryCount} models (${totalBoards} boards) averaged an NG rate of ${avgRate.toFixed(3)}.`;
          document.getElementById('ng-chart-summary').textContent = summary;
          chartNgModal.show();
        });
    });
  }

  // Std Dev Chart modal logic
  const runStdBtn = document.getElementById('run-std-chart-btn');
  const chartStdModalEl = document.getElementById('chart-stddev-modal');
  const chartStdModal = chartStdModalEl ? new bootstrap.Modal(chartStdModalEl) : null;
  const stdCtx = document.getElementById('chart-stddev-canvas');
  const downloadStdBtn = document.getElementById('download-std-pdf');
  let stdChartInstance;
  if (runStdBtn && chartStdModal && stdCtx) {
    runStdBtn.addEventListener('click', () => {
      const start = document.getElementById('std-start-date').value;
      const end = document.getElementById('std-end-date').value;
      const yMax = parseFloat(document.getElementById('std-y-max').value) || 50;
      const threshold = parseInt(document.getElementById('std-min-boards').value) || 0;
      const models = getSelectedModels('std-model-name');
      const modelQuery = models.length ? `&models=${encodeURIComponent(models.join(','))}` : '';
      const filter = modelFilter ? modelFilter.value : 'all';
      const filterQuery = filter !== 'all' ? `&model_filter=${filter}` : '';
      const { query: lineQuery, text: lineText } = getSelectedLines('std-line');
      fetch(`/analysis/stddev-data?start=${start}&end=${end}&threshold=${threshold}${lineQuery}${modelQuery}${filterQuery}`)
        .then(res => res.json())
        .then(data => {
          const rates = data.rates.map(r => r.rate).filter(r => r <= yMax);
          if (stdChartInstance) stdChartInstance.destroy();
          if (!rates.length) {
            stdChartInstance = new Chart(stdCtx, { type: 'bar', data: { labels: [], datasets: [] } });
            document.getElementById('stddev-chart-summary').textContent = 'No data.';
            chartStdModal.show();
            return;
          }
          const mean = data.mean;
          const stdev = data.stdev;
          const { config, rows } = createStdChartConfig(rates, mean, stdev, yMax);
          stdChartInstance = new Chart(stdCtx, config);
          const stdTable = document.getElementById('std-data-table');
          if (stdTable) {
            stdTable.innerHTML = '<thead><tr><th>Range</th><th>Count</th></tr></thead><tbody></tbody>';
            const tbody = stdTable.querySelector('tbody');
            rows.forEach(([range, count]) => {
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${range}</td><td>${count}</td>`;
              tbody.appendChild(tr);
            });
          }
          const rangeText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          document.getElementById('stddev-chart-summary').textContent = `From ${rangeText} on ${lineText}, Avg FC rate ${mean.toFixed(2)} with std dev ${stdev.toFixed(2)}.`;
          chartStdModal.show();
        });
    });
  }

  const runNgStdBtn = document.getElementById('run-ng-std-chart-btn');
  const chartNgStdModalEl = document.getElementById('chart-ng-stddev-modal');
  const chartNgStdModal = chartNgStdModalEl ? new bootstrap.Modal(chartNgStdModalEl) : null;
  const ngStdCtx = document.getElementById('chart-ng-stddev-canvas');
  const downloadNgStdBtn = document.getElementById('download-ng-std-pdf');
  let ngStdChartInstance;
  if (runNgStdBtn && chartNgStdModal && ngStdCtx) {
    runNgStdBtn.addEventListener('click', () => {
      const start = document.getElementById('ng-std-start-date').value;
      const end = document.getElementById('ng-std-end-date').value;
      const yMax = parseFloat(document.getElementById('ng-std-y-max').value) || 1;
      const threshold = parseInt(document.getElementById('ng-std-min-boards').value) || 0;
      const models = getSelectedModels('ng-std-model-name');
      const modelQuery = models.length ? `&models=${encodeURIComponent(models.join(','))}` : '';
      const filter = modelFilter ? modelFilter.value : 'all';
      const filterQuery = filter !== 'all' ? `&model_filter=${filter}` : '';
      const { query: lineQuery, text: lineText } = getSelectedLines('ng-std-line');
      fetch(`/analysis/stddev-data?metric=ng&start=${start}&end=${end}&threshold=${threshold}${lineQuery}${modelQuery}${filterQuery}`)
        .then(res => res.json())
        .then(data => {
          const rates = data.rates.map(r => r.rate).filter(r => r <= yMax);
          if (ngStdChartInstance) ngStdChartInstance.destroy();
          if (!rates.length) {
            ngStdChartInstance = new Chart(ngStdCtx, { type: 'bar', data: { labels: [], datasets: [] } });
            document.getElementById('ng-stddev-chart-summary').textContent = 'No data.';
            chartNgStdModal.show();
            return;
          }
          const mean = data.mean;
          const stdev = data.stdev;
          const { config, rows } = createStdChartConfig(rates, mean, stdev, yMax, {
            barColor: 'rgba(60, 179, 113, 0.7)',
            barBorderColor: 'rgba(60, 179, 113, 1)',
            lineColor: 'rgba(153, 102, 255, 1)',
            decimals: 3
          });
          ngStdChartInstance = new Chart(ngStdCtx, config);
          const ngStdTable = document.getElementById('ng-std-data-table');
          if (ngStdTable) {
            ngStdTable.innerHTML = '<thead><tr><th>Range</th><th>Count</th></tr></thead><tbody></tbody>';
            const tbody = ngStdTable.querySelector('tbody');
            rows.forEach(([range, count]) => {
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${range}</td><td>${count}</td>`;
              tbody.appendChild(tr);
            });
          }
          const rangeText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          document.getElementById('ng-stddev-chart-summary').textContent = `From ${rangeText} on ${lineText}, Avg NG rate ${mean.toFixed(3)} with std dev ${stdev.toFixed(3)}.`;
          chartNgStdModal.show();
        });
    });
  }

  if (downloadStdBtn) {
    downloadStdBtn.addEventListener('click', () => {
      if (!stdChartInstance) return;
      const summary = document.getElementById('stddev-chart-summary').textContent;
      const margin = parseFloat(document.getElementById('std-margin').value) || 0.5;
      exportChartWithTable(
        stdChartInstance,
        '#std-data-table',
        ['Std Dev - Avg FC per Assembly', summary],
        'stddev-chart.pdf',
        'landscape',
        margin
      );
    });
  }

  if (downloadNgStdBtn) {
    downloadNgStdBtn.addEventListener('click', () => {
      if (!ngStdChartInstance) return;
      const summary = document.getElementById('ng-stddev-chart-summary').textContent;
      const margin = parseFloat(document.getElementById('ng-std-margin').value) || 0.5;
      exportChartWithTable(
        ngStdChartInstance,
        '#ng-std-data-table',
        ['Std Dev - Avg NG per Assembly', summary],
        'ng-stddev-chart.pdf',
        'landscape',
        margin
      );
    });
  }

  if (downloadNgBtn) {
    downloadNgBtn.addEventListener('click', () => {
      if (!ngChartInstance) return;
      const summary = document.getElementById('ng-chart-summary').textContent;
      const margin = parseFloat(document.getElementById('ng-margin').value) || 0.5;
      exportChartWithTable(
        ngChartInstance,
        '#ng-data-table',
        ['Control Chart - Avg NG Rate', summary],
        'ng-control-chart.pdf',
        'landscape',
        margin
      );
    });
  }

  // Uploads modal logic (unchanged)
  const uploadsBtn = document.getElementById('show-uploads-btn');
  const uploadsModalEl = document.getElementById('uploads-modal');
  const uploadsModal = uploadsModalEl ? new bootstrap.Modal(uploadsModalEl) : null;
  const uploadsList = document.getElementById('uploads-list');
  if (uploadsBtn && uploadsModal && uploadsList) {
    uploadsBtn.onclick = () => {
      uploadsModal.show();
      uploadsList.innerHTML = '<li>Loading...</li>';
      fetch('/uploads')
        .then(res => res.json())
        .then(data => {
          uploadsList.innerHTML = '';
          const files = data.files || data;
          if (!files.length) uploadsList.innerHTML = '<li>No uploads found</li>';
          files.forEach(fn => {
            const li = document.createElement('li');
            li.textContent = fn;
            const del = document.createElement('button');
            del.textContent = 'Delete';
            del.style.marginLeft = '10px';
            del.onclick = () => {
              const tokenEl = document.querySelector('input[name=csrf_token]');
              const headers = { 'Content-Type': 'application/json' };
              if (tokenEl) headers['X-CSRFToken'] = tokenEl.value;
              fetch('/uploads/delete', {
                method: 'POST',
                headers,
                body: JSON.stringify({ filename: fn })
              }).then(r => {
                if (r.ok) li.remove();
              });
            };
            li.appendChild(del);
            uploadsList.appendChild(li);
          });
        });
    };
  }

  // Report sections (Daily, Weekly, Monthly, Yearly)
  const reportFreqs = ['daily', 'weekly', 'monthly', 'yearly'];
  const reportCharts = {};
  reportFreqs.forEach(freq => {
    const canvas = document.getElementById(`${freq}-report-canvas`);
    const table = document.getElementById(`${freq}-report-table`);
    const pdfBtn = document.getElementById(`download-${freq}-pdf`);
    const xlsxBtn = document.getElementById(`download-${freq}-xlsx`);
    const summaryEl = document.getElementById(`${freq}-report-summary`);
    if (!canvas) return;
    fetch(`/analysis/report-data?freq=${freq}`)
      .then(res => res.json())
      .then(data => {
        if (reportCharts[freq]) {
          reportCharts[freq].destroy();
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        reportCharts[freq] = new Chart(canvas, {
          type: 'line',
          data: {
            labels: data.labels,
            datasets: [
              { label: 'FalseCall PPM', data: data.falsecall_ppm, borderColor: 'black', fill: false },
              { label: 'NG PPM', data: data.ng_ppm, borderColor: 'red', fill: false }
            ]
          },
          options: { scales: { y: { beginAtZero: true } } }
        });
        if (table) {
          table.innerHTML = '<thead><tr><th>Period</th><th>Total Boards</th><th>FalseCall PPM</th><th>NG PPM</th></tr></thead><tbody></tbody>';
          const tbody = table.querySelector('tbody');
          data.table.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${r.period}</td><td>${r.boards}</td><td>${r.falsecall_ppm.toFixed(2)}</td><td>${r.ng_ppm.toFixed(2)}</td>`;
            tbody.appendChild(tr);
          });
          if (summaryEl) {
            const totalBoards = data.table.reduce((sum, r) => sum + r.boards, 0);
            const avgFc = data.table.reduce((sum, r) => sum + r.falsecall_ppm, 0) / (data.table.length || 1);
            const avgNg = data.table.reduce((sum, r) => sum + r.ng_ppm, 0) / (data.table.length || 1);
            summaryEl.textContent = `Avg FalseCall PPM: ${avgFc.toFixed(2)}, Avg NG PPM: ${avgNg.toFixed(2)} across ${totalBoards} boards.`;
          }
        }
      });
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        const chart = reportCharts[freq];
        if (!chart) return;
        const title = `MOAT Report - ${freq.charAt(0).toUpperCase() + freq.slice(1)}`;
        const margin = parseFloat(document.getElementById(`${freq}-margin`).value) || 0.5;
        exportChartWithTable(
          chart,
          `#${freq}-report-table`,
          title,
          `${freq}-report.pdf`,
          'landscape',
          margin
        );
      });
    }
    if (xlsxBtn) {
      xlsxBtn.addEventListener('click', () => {
        exportTableToExcel(`#${freq}-report-table`, `${freq}-report.xlsx`);
      });
    }
  });
});
