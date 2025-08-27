window.addEventListener('DOMContentLoaded', () => {
  const basePath = document.body.dataset.basePath || 'aoi';

  const filterBtn = document.getElementById('aoi-filter-btn');
  const filterForm = document.getElementById('aoi-filter-form');
  if (filterBtn && filterForm) {
    filterBtn.addEventListener('click', () => {
      filterForm.style.display = filterForm.style.display === 'none' ? 'block' : 'none';
    });
  }

  const getData = id => {
    const el = document.getElementById(id);
    return el ? JSON.parse(el.textContent) : null;
  };
  const isAdmin = document.body.dataset.admin === 'true';
  let ops = getData('operator-data') || [];
  let shiftData = getData('shift-data') || [];
  let customerData = getData('customer-data') || [];
  let yieldData = getData('yield-data') || [];
  let assemblies = getData('assembly-data') || [];

  const charts = {};

  function renderOperators() {
    const ctx = document.getElementById('operatorsChart');
    if (!ctx) return;
    if (charts.operators) charts.operators.destroy();
    if (!ops.length) return;
    const labels = ops.map((o, idx) => (isAdmin ? o.operator : `Operator ${idx + 1}`));
    charts.operators = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Accepted', data: ops.map(o => o.inspected - o.rejected), backgroundColor: 'rgba(54,162,235,0.7)' },
          { label: 'Rejected', data: ops.map(o => o.rejected), backgroundColor: 'rgba(255,99,132,0.7)' }
        ]
      },
      options: {
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
        plugins: {
          tooltip: {
            callbacks: {
              label: c => {
                const total = ops[c.dataIndex].inspected;
                const value = c.raw;
                const percent = total ? (value / total * 100).toFixed(1) : 0;
                return `${c.dataset.label}: ${value} (${percent}%)`;
              }
            }
          }
        }
      }
    });
  }

  function renderShift() {
    const ctx = document.getElementById('shiftChart');
    if (!ctx) return;
    if (charts.shift) charts.shift.destroy();
    if (!shiftData.length) return;
    const dates = [...new Set(shiftData.map(r => r.report_date))];
    const shifts = [...new Set(shiftData.map(r => r.shift))];
    const colors = ['rgba(255,99,132,0.7)', 'rgba(54,162,235,0.7)', 'rgba(75,192,192,0.7)', 'rgba(255,205,86,0.7)'];
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
  }

  function renderCustomer() {
    const ctx = document.getElementById('customerChart');
    const stdCtx = document.getElementById('customerStdChart');
    const summaryEl = document.getElementById('customerStdChartSummary');
    if (charts.customer) charts.customer.destroy();
    if (charts.customerStd) charts.customerStd.destroy();
    if (!customerData.length) {
      if (summaryEl) summaryEl.textContent = '';
      return;
    }
    if (ctx) {
      charts.customer = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: customerData.map(c => c.customer),
          datasets: [{ label: 'Reject Rate', data: customerData.map(c => c.rate), backgroundColor: 'rgba(255,159,64,0.7)' }]
        },
        options: { scales: { y: { beginAtZero: true } } }
      });
    }
    if (stdCtx) {
      const rates = customerData.map(c => c.rate);
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
      const stdev = Math.sqrt(variance);
      const yMax = Math.max(...rates, mean + 3 * stdev, 1);
      const { config } = createStdChartConfig(rates, mean, stdev, yMax);
      charts.customerStd = new Chart(stdCtx, config);
      if (summaryEl) summaryEl.textContent = `Avg rate ${mean.toFixed(2)} with std dev ${stdev.toFixed(2)}.`;
    }
  }

  function renderYield() {
    const ctx = document.getElementById('yieldChart');
    if (!ctx) return;
    if (charts.yield) charts.yield.destroy();
    if (!yieldData.length) return;
    const values = yieldData.map(y => y.yield * 100);
    const minVal = Math.min(...values);
    const yMin = minVal < 80 ? minVal : 80;
    charts.yield = new Chart(ctx, {
      type: 'line',
      data: {
        labels: yieldData.map(y => y.report_date || y.period),
        datasets: [{ label: 'Yield %', data: values, fill: false, borderColor: 'rgba(75,192,192,1)' }]
      },
      options: {
        scales: { y: { min: yMin, max: 100, ticks: { callback: v => `${v}%` } } }
      }
    });
  }

  function renderAssembly() {
    const table = document.getElementById('assemblyTable');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = assemblies
        .map(r => `<tr><td>${r.assembly}</td><td>${r.inspected}</td><td>${r.rejected}</td><td>${(r.yield * 100).toFixed(2)}%</td></tr>`)
        .join('');
      if (window.jQuery) {
        if ($.fn.DataTable.isDataTable(table)) $(table).DataTable().destroy();
        $(table).DataTable();
      }
    }
  }

  function renderAll() {
    renderOperators();
    renderShift();
    renderCustomer();
    renderYield();
    renderAssembly();
  }

  renderAll();

  async function refreshData() {
    if (!filterForm) return;
    const params = new URLSearchParams(new FormData(filterForm));
    try {
      const resp = await fetch(`/${basePath}/report-data?${params.toString()}`);
      const data = await resp.json();
      ops = data.operators || [];
      shiftData = data.shift_totals || [];
      customerData = data.customer_rates || [];
      yieldData = data.yield_series || [];
      assemblies = data.assemblies || [];
      renderAll();
    } catch (err) {
      console.error(err);
    }
  }

  if (filterForm) {
    filterForm.addEventListener('change', refreshData);
    filterForm.addEventListener('submit', e => {
      e.preventDefault();
      refreshData();
    });
  }

  const table = document.querySelector(`#${basePath}-table table`);
  if (table) {
    table.addEventListener('click', async e => {
      if (!e.target.classList.contains('delete-row')) return;
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      if (!id || !confirm('Delete this entry?')) return;
      try {
        const tokenEl = document.querySelector('input[name=csrf_token]');
        const headers = tokenEl ? { 'X-CSRFToken': tokenEl.value } : {};
        const resp = await fetch(`/${basePath}/${id}`, { method: 'DELETE', headers });
        const data = await resp.json();
        if (data.success) {
          row.remove();
        }
      } catch (err) {
        console.error(err);
      }
    });

    table.addEventListener('focusout', async e => {
      if (!e.target.classList.contains('editable')) return;
      const cell = e.target;
      const row = cell.closest('tr');
      const id = row.dataset.id;
      const field = cell.dataset.field;
      const value = cell.textContent.trim();
      if (!id || !field) return;
      try {
        const tokenEl = document.querySelector('input[name=csrf_token]');
        const headers = { 'Content-Type': 'application/json' };
        if (tokenEl) headers['X-CSRFToken'] = tokenEl.value;
        const resp = await fetch(`/${basePath}/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ field, value })
        });
        const data = await resp.json();
        if (!data.success) {
          alert(data.error || 'Update failed');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Collapsible cards
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      if (content) {
        content.style.display = content.style.display === 'none' || content.style.display === '' ? 'block' : 'none';
      }
    });
  });

  // Expand chart modal
  const chartModalEl = document.getElementById('chart-modal');
  const chartModal = chartModalEl ? new bootstrap.Modal(chartModalEl) : null;
  const modalTitle = document.getElementById('modal-chart-title');
  const modalCanvas = document.getElementById('modal-chart');
  const modalHead = document.querySelector('#modal-table thead');
  const modalBody = document.querySelector('#modal-table tbody');
  let modalChart;

  function showModal(title, config, headers, rows) {
    if (modalChart) modalChart.destroy();
    modalTitle.textContent = title;
    modalChart = new Chart(modalCanvas, config);
    modalHead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    modalBody.innerHTML = rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
    chartModal.show();
  }

  document.querySelectorAll('.expand-chart').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.chart;
      if (type === 'operators' && ops) {
        const labels = ops.map((o, idx) => isAdmin ? o.operator : `Operator ${idx + 1}`);
        const config = {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Accepted', data: ops.map(o => o.inspected - o.rejected), backgroundColor: 'rgba(54, 162, 235, 0.7)' },
              { label: 'Rejected', data: ops.map(o => o.rejected), backgroundColor: 'rgba(255, 99, 132, 0.7)' }
            ]
          },
          options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        };
        const rows = ops.map((o, idx) => [isAdmin ? o.operator : `Operator ${idx + 1}`, o.inspected, o.rejected]);
        showModal('Top Operators by Inspected Quantity', config, ['Operator','Inspected','Rejected'], rows);
      } else if (type === 'shift' && shiftData) {
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
        const config = { type: 'bar', data: { labels: dates, datasets }, options: { scales: { y: { beginAtZero: true } } } };
        const rows = shiftData.map(r => [r.report_date, r.shift, r.inspected]);
        showModal('Shift Totals', config, ['Date','Shift','Inspected'], rows);
      } else if (type === 'customer' && customerData) {
        const config = {
          type: 'bar',
          data: {
            labels: customerData.map(c => c.customer),
            datasets: [{ label: 'Reject Rate', data: customerData.map(c => c.rate), backgroundColor: 'rgba(255, 159, 64, 0.7)' }]
          },
          options: { scales: { y: { beginAtZero: true } } }
        };
        const rows = customerData.map(c => [c.customer, c.rate]);
        showModal('Operator Reject Rates', config, ['Customer','Reject Rate'], rows);
      } else if (type === 'customer-std' && customerData) {
        const rates = customerData.map(c => c.rate);
        const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
        const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
        const stdev = Math.sqrt(variance);
        const yMax = Math.max(...rates, mean + 3 * stdev, 1);
        const { config, rows } = createStdChartConfig(rates, mean, stdev, yMax);
        showModal('Std Dev of Reject Rates per Customer', config, ['Range','Frequency'], rows);
      } else if (type === 'yield' && yieldData) {
        const config = {
          type: 'line',
          data: {
            labels: yieldData.map(y => y.report_date),
            datasets: [{ label: 'Yield %', data: yieldData.map(y => y.yield * 100), fill: false, borderColor: 'rgba(75, 192, 192, 1)' }]
          },
          options: {
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: { callback: value => `${value}%` }
              }
            }
          }
        };
        const rows = yieldData.map(y => [y.report_date, (y.yield * 100).toFixed(2) + '%']);
        showModal('Overall Yield Over Time', config, ['Date','Yield %'], rows);
      }
    });
  });

  // Reports sub-tabs
  const subLinks = document.querySelectorAll('.subtab-link');
  subLinks.forEach(link => {
    link.addEventListener('click', () => {
      const parent = link.closest('#reports');
      if (!parent) return;
      parent.querySelectorAll('.subtab-link').forEach(l => l.classList.remove('active'));
      parent.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      link.classList.add('active');
      const target = document.getElementById(link.dataset.subtab);
      target?.classList.add('active');
    });
  });

  const reportCharts = {};
  ['daily','weekly','monthly','yearly'].forEach(freq => {
    fetch(`/${basePath}/report-data?freq=${freq}`)
      .then(res => res.json())
      .then(data => renderReport(freq, data));
  });

  function renderReport(freq, data) {
    const isAdmin = document.body.dataset.admin === 'true';
    const ops = data.operators || [];
    if (ops.length) {
      const ctx = document.getElementById(`${freq}-operators`);
      if (ctx) {
        const labels = ops.map((o, idx) => isAdmin ? o.operator : `Operator ${idx + 1}`);
        reportCharts[`${freq}-operators`] = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Accepted', data: ops.map(o => o.inspected - o.rejected), backgroundColor: 'rgba(54, 162, 235, 0.7)' },
              { label: 'Rejected', data: ops.map(o => o.rejected), backgroundColor: 'rgba(255, 99, 132, 0.7)' }
            ]
          },
          options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });
      }
    }

    const shifts = data.shift_totals || [];
    if (shifts.length) {
      const ctx = document.getElementById(`${freq}-shift`);
      if (ctx) {
        reportCharts[`${freq}-shift`] = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: shifts.map(s => s.shift),
            datasets: [{ label: 'Inspected', data: shifts.map(s => s.inspected), backgroundColor: 'rgba(75, 192, 192, 0.7)' }]
          },
          options: { scales: { y: { beginAtZero: true } } }
        });
      }
    }

    const cust = data.customer_rates || [];
    if (cust.length) {
      const ctx = document.getElementById(`${freq}-reject`);
      if (ctx) {
        reportCharts[`${freq}-reject`] = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: cust.map(c => c.customer),
            datasets: [{ label: 'Reject Rate', data: cust.map(c => c.rate), backgroundColor: 'rgba(255, 159, 64, 0.7)' }]
          },
          options: { scales: { y: { beginAtZero: true } } }
        });
      }
    }

    const ySeries = data.yield_series || [];
    if (ySeries.length) {
      const ctx = document.getElementById(`${freq}-yield`);
      if (ctx) {
        reportCharts[`${freq}-yield`] = new Chart(ctx, {
          type: 'line',
          data: {
            labels: ySeries.map(y => y.report_date),
            datasets: [{ label: 'Yield %', data: ySeries.map(y => y.yield * 100), fill: false, borderColor: 'rgba(75, 192, 192, 1)' }]
          },
          options: {
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: { callback: value => `${value}%` }
              }
            }
          }
        });
      }
    }

    const table = document.querySelector(`#${freq}-table tbody`);
    if (table) {
      table.innerHTML = '';
      (data.assemblies || []).forEach(r => {
        const tr = document.createElement('tr');
        const yieldPct = r.yield ? (r.yield * 100).toFixed(2) + '%' : '0%';
        tr.innerHTML = `<td>${r.assembly}</td><td>${r.inspected}</td><td>${r.rejected}</td><td>${yieldPct}</td>`;
        table.appendChild(tr);
      });
    }
  }

  document.querySelectorAll('.download-report').forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape' });
      pdf.text(`${period.charAt(0).toUpperCase()+period.slice(1)} AOI Summary`, 10, 10);
      let y = 20;
      ['operators','shift','reject','yield'].forEach(name => {
        const chart = reportCharts[`${period}-${name}`];
        if (chart) {
          let img;
          try {
            img = chart.toBase64Image();
          } catch (err) {
            if (err instanceof DOMException && err.name === 'SecurityError') {
              // fall back to canvas rendering
            } else {
              console.error(err);
            }
          }
          const validMime = d => typeof d === 'string' && /^data:image\/(png|jpe?g|webp);/i.test(d);
          if (!img || !validMime(img)) {
            const canvas = chart.canvas;
            if (canvas && canvas.toDataURL) {
              try {
                img = canvas.toDataURL('image/png');
              } catch (err) {
                if (err instanceof DOMException && err.name === 'SecurityError') {
                  try {
                    const tmp = document.createElement('canvas');
                    tmp.width = canvas.width;
                    tmp.height = canvas.height;
                    tmp.getContext('2d').drawImage(canvas, 0, 0);
                    img = tmp.toDataURL('image/png');
                  } catch (err2) {
                    console.error('Canvas is tainted and cannot be exported', err2);
                    alert('Unable to add chart: the canvas has been tainted by cross-origin data.');
                    return;
                  }
                } else {
                  console.error(err);
                  return;
                }
              }
            }
            if (!img || !validMime(img)) {
              console.error('Unsupported image format for PDF export');
              alert('Unable to add chart: unsupported image format.');
              return;
            }
          }
          const props = pdf.getImageProperties(img);
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 10;
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - margin * 2;
          const scale = Math.min(maxWidth / props.width, maxHeight / props.height);
          const imgWidth = props.width * scale;
          const imgHeight = props.height * scale;
          if (y + imgHeight > pageHeight - margin) { pdf.addPage(); y = margin; }
          pdf.addImage(img, 'PNG', margin, y, imgWidth, imgHeight);
          y += imgHeight + 10;
        }
      });
      pdf.addPage('portrait');
      pdf.autoTable({ html: `#${period}-table`, startY: 10 });
      pdf.save(`${period}-aoi-summary.pdf`);
    });
  });
});

