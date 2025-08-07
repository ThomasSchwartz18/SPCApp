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

  // Chart modal logic
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
      fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}`)
        .then(res => res.json())
        .then(data => {
          const labels = data.map(d => d.model);
          const values = data.map(d => d.rate);
          if (chartInstance) chartInstance.destroy();
          chartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'FalseCall Rate', data: values }] },
            options: { scales: { y: { beginAtZero: true, max: yMax } } }
          });
          chartModal.style.display = 'block';
        });
    });
    closeChart.addEventListener('click', () => { chartModal.style.display = 'none'; });
    window.addEventListener('click', e => { if (e.target === chartModal) chartModal.style.display = 'none'; });
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
