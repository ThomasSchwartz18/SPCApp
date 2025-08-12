window.addEventListener('DOMContentLoaded', () => {
  // Divider logic
  const divider = document.getElementById('divider');
  const container = document.getElementById('container');
  if (divider && container) {
    let isDragging = false;
    divider.addEventListener('mousedown', () => { isDragging = true; document.body.style.cursor = 'col-resize'; });
    document.addEventListener('mouseup', () => { isDragging = false; document.body.style.cursor = 'default'; });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      let offset = e.clientX - rect.left;
      offset = Math.max(100, Math.min(offset, rect.width - 100));
      const actionsEl = document.getElementById('analysis-actions');
      if (actionsEl) actionsEl.style.flex = `0 0 ${offset}px`;
    });
  }

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
  const chartModal = document.getElementById('chart-modal');
  const closeChart = document.getElementById('close-chart-modal');
  const ctx = document.getElementById('chart-canvas');
  const downloadFcBtn = document.getElementById('download-fc-pdf');
  let chartInstance;

  if (runBtn && chartModal && closeChart && ctx) {
    runBtn.addEventListener('click', () => {
      const start = document.getElementById('start-date').value;
      const end = document.getElementById('end-date').value;
      const yMax = parseFloat(document.getElementById('y-max').value) || 1;
      const threshold = parseInt(document.getElementById('min-boards').value) || 0;
      const { query: lineQuery, text: lineText } = getSelectedLines('line');
      fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}&metric=fc${lineQuery}`)
        .then(res => res.json())
        .then(data => {
          const labels = data.map(d => d.model);
          const inRangeValues = data.map(d => (d.rate <= yMax ? d.rate : null));
          const outliers = data.filter(d => d.rate > yMax);
          if (chartInstance) chartInstance.destroy();
          chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: 'FalseCall Rate',
                  data: inRangeValues,
                  borderColor: 'black',
                  pointBackgroundColor: 'black',
                  pointBorderColor: 'black',
                  fill: false,
                  tension: 0,
                  borderWidth: 1,
                  clip: false
                },
                {
                  label: 'Outliers',
                  data: outliers.map(d => ({ x: d.model, y: yMax, real: d.rate })),
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
          const dateText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          document.getElementById('fc-chart-date-range').textContent = `${dateText} | Lines: ${lineText}`;
          chartModal.style.display = 'block';
        });
    });
    closeChart.addEventListener('click', () => { chartModal.style.display = 'none'; });
    window.addEventListener('click', e => { if (e.target === chartModal) chartModal.style.display = 'none'; });
  }

  if (downloadFcBtn) {
    downloadFcBtn.addEventListener('click', () => {
      if (!chartInstance) return;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape' });
      pdf.text('Control Chart - Avg FalseCall Rate', 10, 10);
      const dateText = document.getElementById('fc-chart-date-range').textContent;
      pdf.text(dateText, 10, 20);
      const imgData = chartInstance.toBase64Image();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 10, 30, pdfWidth, pdfHeight);
      pdf.save('fc-control-chart.pdf');
    });
  }

  // NG Chart modal logic
  const runNgBtn = document.getElementById('run-ng-chart-btn');
  const chartNgModal = document.getElementById('chart-ng-modal');
  const closeNgChart = document.getElementById('close-chart-ng-modal');
  const ngCtx = document.getElementById('chart-ng-canvas');
  const downloadNgBtn = document.getElementById('download-ng-pdf');
  let ngChartInstance;

  if (runNgBtn && chartNgModal && closeNgChart && ngCtx) {
    runNgBtn.addEventListener('click', () => {
      const start = document.getElementById('ng-start-date').value;
      const end = document.getElementById('ng-end-date').value;
      const yMax = parseFloat(document.getElementById('ng-y-max').value) || 1;
      const threshold = parseInt(document.getElementById('ng-min-boards').value) || 0;
      const { query: lineQuery, text: lineText } = getSelectedLines('ng-line');
      fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}&metric=ng${lineQuery}`)
        .then(res => res.json())
        .then(data => {
          const labels = data.map(d => d.model);
          const inRangeValues = data.map(d => (d.rate <= yMax ? d.rate : null));
          const outliers = data.filter(d => d.rate > yMax);
          if (ngChartInstance) ngChartInstance.destroy();
          ngChartInstance = new Chart(ngCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: 'NG Rate',
                  data: inRangeValues,
                  borderColor: 'black',
                  pointBackgroundColor: 'black',
                  pointBorderColor: 'black',
                  fill: false,
                  tension: 0,
                  borderWidth: 1,
                  clip: false
                },
                {
                  label: 'Outliers',
                  data: outliers.map(d => ({ x: d.model, y: yMax, real: d.rate })),
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
                thresholdPlugin: { red: { value: 0.1, color: 'red' } },
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
          const dateText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          document.getElementById('ng-chart-date-range').textContent = `${dateText} | Lines: ${lineText}`;
          chartNgModal.style.display = 'block';
        });
    });
    closeNgChart.addEventListener('click', () => { chartNgModal.style.display = 'none'; });
    window.addEventListener('click', e => { if (e.target === chartNgModal) chartNgModal.style.display = 'none'; });
  }

  if (downloadNgBtn) {
    downloadNgBtn.addEventListener('click', () => {
      if (!ngChartInstance) return;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape' });
      pdf.text('Control Chart - Avg NG Rate', 10, 10);
      const dateText = document.getElementById('ng-chart-date-range').textContent;
      pdf.text(dateText, 10, 20);
      const imgData = ngChartInstance.toBase64Image();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 10, 30, pdfWidth, pdfHeight);
      pdf.save('ng-control-chart.pdf');
    });
  }

  // Uploads modal logic (unchanged)
  const uploadsBtn = document.getElementById('show-uploads-btn');
  const uploadsModal = document.getElementById('uploads-modal');
  const closeUploads = document.getElementById('close-uploads-modal');
  const uploadsList = document.getElementById('uploads-list');
  if (uploadsBtn && uploadsModal && closeUploads && uploadsList) {
    uploadsBtn.onclick = () => {
      uploadsModal.style.display = 'block';
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
              fetch('/uploads/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filename:fn}) })
                .then(r => r.ok ? li.remove() : null);
            };
            li.appendChild(del);
            uploadsList.appendChild(li);
          });
        });
    };
    closeUploads.onclick = () => { uploadsModal.style.display = 'none'; };
    window.addEventListener('click', e => { if (e.target === uploadsModal) uploadsModal.style.display = 'none'; });
  }
});
