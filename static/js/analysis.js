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
      if (options.yellow) {
        const yPos = y.getPixelForValue(options.yellow.value);
        ctx.strokeStyle = options.yellow.color;
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
  let chartInstance;

  if (runBtn && chartModal && closeChart && ctx) {
    runBtn.addEventListener('click', () => {
      const start = document.getElementById('start-date').value;
      const end = document.getElementById('end-date').value;
      const yMax = parseFloat(document.getElementById('y-max').value) || 1;
      const threshold = parseInt(document.getElementById('min-boards').value) || 0;
      fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}&metric=fc`)
        .then(res => res.json())
        .then(data => {
          const labels = data.map(d => d.model);
          const values = data.map(d => d.rate);
          if (chartInstance) chartInstance.destroy();
          chartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'FalseCall Rate', data: values }] },
            options: {
              scales: { y: { beginAtZero: true, max: yMax } },
              plugins: { thresholdPlugin: { red: {value:20, color:'red'}, yellow: {value:10, color:'yellow'} } }
            },
            plugins: [thresholdPlugin]
          });
          const dateText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          document.getElementById('fc-chart-date-range').textContent = dateText;
          chartModal.style.display = 'block';
        });
    });
    closeChart.addEventListener('click', () => { chartModal.style.display = 'none'; });
    window.addEventListener('click', e => { if (e.target === chartModal) chartModal.style.display = 'none'; });
  }

  // NG Chart modal logic
  const runNgBtn = document.getElementById('run-ng-chart-btn');
  const chartNgModal = document.getElementById('chart-ng-modal');
  const closeNgChart = document.getElementById('close-chart-ng-modal');
  const ngCtx = document.getElementById('chart-ng-canvas');
  let ngChartInstance;

  if (runNgBtn && chartNgModal && closeNgChart && ngCtx) {
    runNgBtn.addEventListener('click', () => {
      const start = document.getElementById('ng-start-date').value;
      const end = document.getElementById('ng-end-date').value;
      const yMax = parseFloat(document.getElementById('ng-y-max').value) || 1;
      const threshold = parseInt(document.getElementById('ng-min-boards').value) || 0;
      fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}&metric=ng`)
        .then(res => res.json())
        .then(data => {
          const labels = data.map(d => d.model);
          const values = data.map(d => d.rate);
          if (ngChartInstance) ngChartInstance.destroy();
          ngChartInstance = new Chart(ngCtx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'NG Rate', data: values }] },
            options: {
              scales: { y: { beginAtZero: true, max: yMax } },
              plugins: { thresholdPlugin: { red: {value:0.1, color:'red'} } }
            },
            plugins: [thresholdPlugin]
          });
          const dateText = start && end ? `${start} to ${end}` : start ? `From ${start}` : end ? `Up to ${end}` : 'All dates';
          document.getElementById('ng-chart-date-range').textContent = dateText;
          chartNgModal.style.display = 'block';
        });
    });
    closeNgChart.addEventListener('click', () => { chartNgModal.style.display = 'none'; });
    window.addEventListener('click', e => { if (e.target === chartNgModal) chartNgModal.style.display = 'none'; });
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
