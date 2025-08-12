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
      const actionsEl = document.getElementById('aoi-actions');
      if (actionsEl) actionsEl.style.flex = `0 0 ${offset}px`;
    });
  }

  const getData = id => {
    const el = document.getElementById(id);
    return el ? JSON.parse(el.textContent) : null;
  };

  const ops = getData('operator-data');
  if (ops && ops.length) {
    const ctx = document.getElementById('operatorsChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ops.map(o => o.operator),
          datasets: [{
            label: 'Inspected',
            data: ops.map(o => o.inspected),
            backgroundColor: 'rgba(54, 162, 235, 0.7)'
          }]
        },
        options: {
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
  }

  const shiftData = getData('shift-data');
  if (shiftData && shiftData.length) {
    const ctx = document.getElementById('shiftChart');
    if (ctx) {
      const dates = [...new Set(shiftData.map(r => r.report_date))];
      const shifts = [...new Set(shiftData.map(r => r.shift))];
      const colors = ['rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(75, 192, 192, 0.7)', 'rgba(255, 205, 86, 0.7)'];
      const datasets = shifts.map((s, idx) => ({
        label: s,
        data: dates.map(d => {
          const row = shiftData.find(r => r.report_date === d && r.shift === s);
          return row ? row.inspected : 0;
        }),
        backgroundColor: colors[idx % colors.length]
      }));
      new Chart(ctx, {
        type: 'bar',
        data: { labels: dates, datasets },
        options: { scales: { y: { beginAtZero: true } } }
      });
    }
  }

  const customerData = getData('customer-data');
  if (customerData && customerData.length) {
    const ctx = document.getElementById('customerChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: customerData.map(c => c.customer),
          datasets: [{
            label: 'Reject Rate',
            data: customerData.map(c => c.rate),
            backgroundColor: 'rgba(255, 159, 64, 0.7)'
          }]
        },
        options: { scales: { y: { beginAtZero: true } } }
      });
    }
  }

  const yieldData = getData('yield-data');
  if (yieldData && yieldData.length) {
    const ctx = document.getElementById('yieldChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: yieldData.map(y => y.report_date),
          datasets: [{
            label: 'Yield',
            data: yieldData.map(y => y.yield),
            fill: false,
            borderColor: 'rgba(75, 192, 192, 1)'
          }]
        },
        options: { scales: { y: { beginAtZero: true, max: 1 } } }
      });
    }
  }

  if (window.jQuery) {
    $('#assemblyTable').DataTable();
  }
});

