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
  const charts = {};
  if (ops && ops.length) {
    const ctx = document.getElementById('operatorsChart');
    if (ctx) {
      charts.operators = new Chart(ctx, {
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
      ctx.addEventListener('click', () => openModal(charts.operators, 'Top Operators by Inspected Quantity'));
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
      charts.shift = new Chart(ctx, {
        type: 'bar',
        data: { labels: dates, datasets },
        options: { scales: { y: { beginAtZero: true } } }
      });
      ctx.addEventListener('click', () => openModal(charts.shift, 'Shift Totals'));
    }
  }

  const customerData = getData('customer-data');
  if (customerData && customerData.length) {
    const ctx = document.getElementById('customerChart');
    if (ctx) {
      charts.customer = new Chart(ctx, {
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
      ctx.addEventListener('click', () => openModal(charts.customer, 'Customer Reject Rates'));
    }
  }

  const yieldData = getData('yield-data');
  if (yieldData && yieldData.length) {
    const ctx = document.getElementById('yieldChart');
    if (ctx) {
      charts.yield = new Chart(ctx, {
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
      ctx.addEventListener('click', () => openModal(charts.yield, 'Overall Yield Over Time'));
    }
  }

  if (window.jQuery) {
    $('#assemblyTable').DataTable();
  }

  const table = document.querySelector('#aoi-table table');
  if (table) {
    table.addEventListener('click', async e => {
      if (!e.target.classList.contains('delete-row')) return;
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      if (!id || !confirm('Delete this entry?')) return;
      try {
        const resp = await fetch(`/aoi/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
          row.remove();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Modal logic for charts
  const modal = document.getElementById('chart-modal');
  const modalCanvas = document.getElementById('chart-canvas');
  const modalTitle = document.getElementById('chart-modal-title');
  const closeModal = document.getElementById('close-chart-modal');
  const downloadBtn = document.getElementById('download-chart-pdf');
  let modalChart;

  function cloneOptions(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cloneOptions);
    const result = {};
    for (const key in obj) {
      result[key] = cloneOptions(obj[key]);
    }
    return result;
  }

  function openModal(chart, title) {
    if (!modal || !modalCanvas) return;
    if (modalChart) modalChart.destroy();
    const dataCopy = JSON.parse(JSON.stringify(chart.data));
    const optionsCopy = cloneOptions(chart.options);
    modalChart = new Chart(modalCanvas, {
      type: chart.config.type,
      data: dataCopy,
      options: optionsCopy
    });
    if (modalTitle) modalTitle.textContent = title || '';
    modal.style.display = 'block';
  }

  document.querySelectorAll('.expand-chart').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.chart;
      const title = btn.dataset.title || '';
      const chart = charts[key];
      if (chart) openModal(chart, title);
    });
  });

  closeModal?.addEventListener('click', () => { modal.style.display = 'none'; });
  window.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  downloadBtn?.addEventListener('click', () => {
    if (!modalChart) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape' });
    if (modalTitle) pdf.text(modalTitle.textContent, 10, 10);
    const imgData = modalChart.toBase64Image();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 10, 20, pdfWidth, pdfHeight);
    pdf.save('chart.pdf');
  });
});

