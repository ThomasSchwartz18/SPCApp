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

  // Helpers to build datasets
  function buildOperatorsChartData(full = false) {
    if (!ops.length) return null;
    let data = [...ops].sort((a, b) => b.inspected - a.inspected);
    if (!full) data = data.slice(0, 5);
    const labels = data.map((o, idx) => (isAdmin ? o.operator : `Operator ${idx + 1}`));
    const inspected = data.map(o => o.inspected);
    const rejected = data.map(o => o.rejected);
    const totals = {
      inspected: inspected.reduce((a, b) => a + b, 0),
      rejected: rejected.reduce((a, b) => a + b, 0)
    };
    return { labels, inspected, rejected, totals };
  }

  function buildShiftChartData(full = false) {
    if (!shiftData.length) return null;
    let dates = [...new Set(shiftData.map(r => r.report_date))].sort();
    if (!full) dates = dates.slice(-5);
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
    const totals = {
      inspected: dates.map((_, i) => datasets.reduce((sum, ds) => sum + ds.data[i], 0)).reduce((a, b) => a + b, 0)
    };
    return { dates, datasets, totals };
  }

  function buildCustomerChartData(full = false) {
    if (!customerData.length) return null;
    let data = [...customerData].sort((a, b) => b.rate - a.rate);
    if (!full) data = data.slice(0, 5);
    const labels = data.map(c => c.customer);
    const rates = data.map(c => c.rate);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
    const stdev = Math.sqrt(variance);
    const yMax = Math.max(...rates, mean + 3 * stdev, 1);
    const { config: stdConfig, rows: stdRows } = createStdChartConfig(rates, mean, stdev, yMax);
    return { labels, rates, mean, stdev, stdConfig, stdRows };
  }

  function buildYieldChartData(full = false) {
    if (!yieldData.length) return null;
    let data = [...yieldData];
    if (!full) data = data.slice(-5);
    const labels = data.map(y => y.report_date || y.period);
    const values = data.map(y => y.yield * 100);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const minVal = Math.min(...values);
    const yMin = minVal < 80 ? minVal : 80;
    return { labels, values, avg, yMin };
  }

  // Chart renderers using datasets
  function renderOperators(mode = 'widget', dataSet = null) {
    const data = dataSet || buildOperatorsChartData(mode === 'detail');
    if (!data) return null;
    const config = {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Accepted', data: data.inspected.map((v, i) => v - data.rejected[i]), backgroundColor: 'rgba(54,162,235,0.7)' },
          { label: 'Rejected', data: data.rejected, backgroundColor: 'rgba(255,99,132,0.7)' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true }
        },
        plugins: {
          legend: { display: mode === 'detail' },
          tooltip: mode === 'detail'
            ? {
                callbacks: {
                  label: c => {
                    const total = data.inspected[c.dataIndex];
                    const value = c.raw;
                    const percent = total ? (value / total * 100).toFixed(1) : 0;
                    return `${c.dataset.label}: ${value} (${percent}%)`;
                  }
                }
              }
            : { enabled: false }
        }
      }
    };
    if (mode === 'widget') {
      config.options.scales.x.ticks = { maxTicksLimit: 5 };
      config.options.scales.y.ticks = { maxTicksLimit: 5 };
    }
    return config;
  }

  function renderShift(mode = 'widget', dataSet = null) {
    const data = dataSet || buildShiftChartData(mode === 'detail');
    if (!data) return null;
    const config = {
      type: 'bar',
      data: { labels: data.dates, datasets: data.datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
          x: {}
        },
        plugins: {
          legend: { display: mode === 'detail' },
          tooltip: { enabled: mode === 'detail' }
        }
      }
    };
    if (mode === 'widget') {
      config.options.scales.x.ticks = { maxTicksLimit: 5 };
      config.options.scales.y.ticks = { maxTicksLimit: 5 };
    }
    return config;
  }

  function renderCustomer(mode = 'widget', dataSet = null) {
    const data = dataSet || buildCustomerChartData(mode === 'detail');
    if (!data) return null;
    const barConfig = {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{ label: 'Reject Rate', data: data.rates, backgroundColor: 'rgba(255,159,64,0.7)' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
          x: {}
        },
        plugins: {
          legend: { display: mode === 'detail' },
          tooltip: { enabled: mode === 'detail' }
        }
      }
    };
    if (mode === 'widget') {
      barConfig.options.scales.x.ticks = { maxTicksLimit: 5 };
      barConfig.options.scales.y.ticks = { maxTicksLimit: 5 };
    }

    const stdConfig = data.stdConfig;
    stdConfig.options = {
      ...stdConfig.options,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...(stdConfig.options.plugins || {}),
        legend: { display: mode === 'detail' },
        tooltip: { enabled: mode === 'detail' }
      },
      scales: {
        x: { ...(stdConfig.options.scales?.x || {}) },
        y: { ...(stdConfig.options.scales?.y || {}) }
      }
    };
    if (mode === 'widget') {
      stdConfig.options.scales.x.ticks = { maxTicksLimit: 5 };
      stdConfig.options.scales.y.ticks = { maxTicksLimit: 5 };
    }
    const barRows = data.labels.map((c, idx) => [c, data.rates[idx]]);
    const summary = `Avg rate ${data.mean.toFixed(2)} with std dev ${data.stdev.toFixed(2)}.`;
    return { barConfig, stdConfig, barRows, stdRows: data.stdRows, mean: data.mean, summary };
  }

  function renderYield(mode = 'widget', dataSet = null) {
    const data = dataSet || buildYieldChartData(mode === 'detail');
    if (!data) return null;
    const config = {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{ label: 'Yield %', data: data.values, fill: false, borderColor: 'rgba(75,192,192,1)' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: data.yMin, max: 100, ticks: { callback: v => `${v}%` } },
          x: {}
        },
        plugins: {
          legend: { display: mode === 'detail' },
          tooltip: { enabled: mode === 'detail' }
        }
      }
    };
    if (mode === 'widget') {
      config.options.scales.x.ticks = { maxTicksLimit: 5 };
      config.options.scales.y.ticks = { maxTicksLimit: 5 };
    }
    return config;
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
    const opCtx = document.getElementById('operatorsChart');
    if (opCtx) {
      const cfg = renderOperators('widget');
      if (cfg) {
        if (charts.operators) charts.operators.destroy();
        charts.operators = new Chart(opCtx, cfg);
      }
    }

    const shiftCtx = document.getElementById('shiftChart');
    if (shiftCtx) {
      const cfg = renderShift('widget');
      if (cfg) {
        if (charts.shift) charts.shift.destroy();
        charts.shift = new Chart(shiftCtx, cfg);
      }
    }

    const custCtx = document.getElementById('customerChart');
    const custStdCtx = document.getElementById('customerStdChart');
    const summaryEl = document.getElementById('customerStdChartSummary');
    const custCfg = renderCustomer('widget');
    if (custCfg) {
      if (custCtx) {
        if (charts.customer) charts.customer.destroy();
        charts.customer = new Chart(custCtx, custCfg.barConfig);
      }
      if (custStdCtx) {
        if (charts.customerStd) charts.customerStd.destroy();
        charts.customerStd = new Chart(custStdCtx, custCfg.stdConfig);
      }
      if (summaryEl) summaryEl.textContent = custCfg.summary;
    } else if (summaryEl) {
      summaryEl.textContent = '';
    }

    const yieldCtx = document.getElementById('yieldChart');
    if (yieldCtx) {
      const cfg = renderYield('widget');
      if (cfg) {
        if (charts.yield) charts.yield.destroy();
        charts.yield = new Chart(yieldCtx, cfg);
      }
    }

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

  document.querySelectorAll('.expand-chart').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.chart;
      if (type === 'operators' && ops.length) {
        const data = buildOperatorsChartData(true);
        const config = renderOperators('detail', data);
        config.options.plugins.legend.display = true;
        config.options.scales.x.title = { display: true, text: 'Operator' };
        config.options.scales.y.title = { display: true, text: 'Quantity' };
        config.options.plugins.annotation = {
          annotations: {
            total: {
              type: 'line',
              yMin: data.totals.inspected,
              yMax: data.totals.inspected,
              borderColor: 'red',
              borderDash: [4, 4]
            }
          }
        };
        const rows = data.labels.map((label, idx) => [label, data.inspected[idx], data.rejected[idx]]);
        rows.push(['Total', data.totals.inspected, data.totals.rejected]);
        ChartModal.show('Top Operators by Inspected Quantity', config, ['Operator','Inspected','Rejected'], rows);
      } else if (type === 'shift' && shiftData.length) {
        const data = buildShiftChartData(true);
        const config = renderShift('detail', data);
        config.options.plugins.legend.display = true;
        config.options.scales.x.title = { display: true, text: 'Date' };
        config.options.scales.y.title = { display: true, text: 'Inspected' };
        const avg = data.totals.inspected / data.dates.length;
        config.options.plugins.annotation = {
          annotations: {
            avg: { type: 'line', yMin: avg, yMax: avg, borderColor: 'red', borderDash: [4, 4] }
          }
        };
        const rows = shiftData.map(r => [r.report_date, r.shift, r.inspected]);
        rows.push(['', 'Total', data.totals.inspected]);
        ChartModal.show('Shift Totals', config, ['Date','Shift','Inspected'], rows);
      } else if (type === 'customer' && customerData.length) {
        const data = buildCustomerChartData(true);
        const { barConfig, barRows, mean } = renderCustomer('detail', data);
        barConfig.options.plugins.legend.display = true;
        barConfig.options.scales.x.title = { display: true, text: 'Customer' };
        barConfig.options.scales.y.title = { display: true, text: 'Reject Rate' };
        const rows = [...barRows, ['Average', mean.toFixed(2)]];
        ChartModal.show('Operator Reject Rates', barConfig, ['Customer','Reject Rate'], rows);
      } else if (type === 'customer-std' && customerData.length) {
        const data = buildCustomerChartData(true);
        const { stdConfig, stdRows, mean } = renderCustomer('detail', data);
        stdConfig.options.plugins.legend.display = true;
        stdConfig.options.scales.x.title = { display: true, text: 'Range' };
        stdConfig.options.scales.y.title = { display: true, text: 'Frequency' };
        const rows = [...stdRows, ['Mean', mean.toFixed(2)]];
        ChartModal.show('Std Dev of Reject Rates per Customer', stdConfig, ['Range','Frequency'], rows);
      } else if (type === 'yield' && yieldData.length) {
        const data = buildYieldChartData(true);
        const config = renderYield('detail', data);
        config.options.plugins.legend.display = true;
        config.options.scales.x.title = { display: true, text: 'Date' };
        config.options.scales.y.title = { display: true, text: 'Yield %' };
        config.options.plugins.annotation = {
          annotations: {
            avg: {
              type: 'line',
              yMin: data.avg,
              yMax: data.avg,
              borderColor: 'red',
              borderDash: [4, 4]
            }
          }
        };
        const rows = data.labels.map((label, idx) => [label, data.values[idx].toFixed(2) + '%']);
        rows.push(['Average', data.avg.toFixed(2) + '%']);
        ChartModal.show('Overall Yield Over Time', config, ['Date','Yield %'], rows);
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
          options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
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
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
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
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
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
            responsive: true,
            maintainAspectRatio: false,
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

