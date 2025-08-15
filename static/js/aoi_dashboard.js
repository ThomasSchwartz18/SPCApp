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
  const isAdmin = document.body.dataset.admin === 'true';
  if (ops && ops.length) {
    const ctx = document.getElementById('operatorsChart');
    if (ctx) {
      const labels = ops.map((o, idx) => isAdmin ? o.operator : `Operator ${idx + 1}`);
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Accepted',
              data: ops.map(o => o.inspected - o.rejected),
              backgroundColor: 'rgba(54, 162, 235, 0.7)'
            },
            {
              label: 'Rejected',
              data: ops.map(o => o.rejected),
              backgroundColor: 'rgba(255, 99, 132, 0.7)'
            }
          ]
        },
        options: {
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: ctx => {
                  const total = ops[ctx.dataIndex].inspected;
                  const value = ctx.raw;
                  const percent = total ? (value / total * 100).toFixed(1) : 0;
                  return `${ctx.dataset.label}: ${value} (${percent}%)`;
                }
              }
            }
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
            label: 'Yield %',
            data: yieldData.map(y => y.yield * 100),
            fill: false,
            borderColor: 'rgba(75, 192, 192, 1)'
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: value => `${value}%`
              }
            }
          }
        }
      });
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
  const chartModal = document.getElementById('chart-modal');
  const closeChart = document.getElementById('close-chart-modal');
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
    chartModal.style.display = 'block';
  }

  closeChart?.addEventListener('click', () => { chartModal.style.display = 'none'; });
  window.addEventListener('click', e => { if (e.target === chartModal) chartModal.style.display = 'none'; });

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
    fetch(`/aoi/report-data?freq=${freq}`)
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
          const width = pdf.internal.pageSize.getWidth() - 20;
          const height = (props.height * width) / props.width;
          pdf.addImage(img, 'PNG', 10, y, width, height);
          y += height + 10;
          if (y > pdf.internal.pageSize.getHeight() - 20) { pdf.addPage(); y = 20; }
        }
      });
      pdf.addPage('portrait');
      pdf.autoTable({ html: `#${period}-table`, startY: 10 });
      pdf.save(`${period}-aoi-summary.pdf`);
    });
  });
});

