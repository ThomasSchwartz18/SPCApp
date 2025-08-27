// aoi_fi_compare.js
// Build comparison charts and tables for AOI vs Final Inspect data

(function () {
  const getJSON = id => {
    const el = document.getElementById(id);
    if (!el) return [];
    try {
      return JSON.parse(el.textContent || '[]');
    } catch {
      return [];
    }
  };

  function buildGrades(mode = 'widget') {
    const grades = getJSON('grade-data');
    let data = [...grades];
    if (mode === 'widget' && data.length > 5) data = data.slice(0, 5);
    const labels = data.map(g => g.operator || '');
    const coverage = data.map(g => (g.coverage == null ? 0 : Math.round(g.coverage * 10000) / 100));
    const colors = data.map(g => {
      if (g.grade == null) return 'gray';
      switch (g.grade) {
        case 'A':
          return 'green';
        case 'B':
          return 'blue';
        case 'C':
          return 'orange';
        default:
          return 'red';
      }
    });
    const config = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Detection Coverage (%)',
            data: coverage,
            backgroundColor: colors
          }
        ]
      },
      options: {
        scales: {
          y: { beginAtZero: true, max: 100 }
        },
        plugins: {
          legend: { display: mode === 'detail' }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    };
    if (mode === 'widget') {
      config.options.scales.x = { ticks: { maxTicksLimit: 5 } };
      config.options.scales.y.ticks = { maxTicksLimit: 5 };
    } else {
      config.options.scales.x = { title: { display: true, text: 'Operator' } };
      config.options.scales.y.title = { display: true, text: 'Coverage %' };
    }
    const rows = data.map(g => [g.operator || '', g.coverage == null ? '' : (g.coverage * 100).toFixed(2) + '%', g.grade || '']);
    return { config, rows };
  }

  function buildYield(mode = 'widget') {
    const aoiSeries = getJSON('aoi-series');
    const fiSeries = getJSON('fi-series');
    const dates = Array.from(new Set([...aoiSeries.map(r => r.date), ...fiSeries.map(r => r.date)])).sort();
    const aoiMap = Object.fromEntries(aoiSeries.map(r => [r.date, r.yield]));
    const fiMap = Object.fromEntries(fiSeries.map(r => [r.date, r.yield]));
    const aoiVals = dates.map(d => aoiMap[d]).filter(v => v != null);
    const fiVals = dates.map(d => fiMap[d]).filter(v => v != null);
    const allVals = aoiVals.concat(fiVals);
    const minVal = allVals.length ? Math.min(...allVals) : 0.8;
    const yMin = minVal < 0.8 ? minVal : 0.8;
    const config = {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'AOI Yield',
            data: dates.map(d => aoiMap[d] ?? null),
            borderColor: 'blue',
            fill: false
          },
          {
            label: 'Final Inspect Yield',
            data: dates.map(d => fiMap[d] ?? null),
            borderColor: 'green',
            fill: false
          }
        ]
      },
      options: {
        scales: {
          y: { min: yMin, max: 1 }
        },
        plugins: {
          legend: { display: mode === 'detail' }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    };
    if (mode === 'widget') {
      config.options.scales.x = { ticks: { maxTicksLimit: 5 } };
      config.options.scales.y.ticks = { maxTicksLimit: 5 };
    } else {
      config.options.scales.x = { title: { display: true, text: 'Date' } };
      config.options.scales.y.title = { display: true, text: 'Yield' };
    }
    const rows = dates.map(d => [
      d,
      aoiMap[d] != null ? (aoiMap[d] * 100).toFixed(2) + '%' : '',
      fiMap[d] != null ? (fiMap[d] * 100).toFixed(2) + '%' : ''
    ]);
    return { config, rows };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const gradesCtx = document.getElementById('operatorGradesChart');
    if (gradesCtx) {
      const { config } = buildGrades('widget');
      new Chart(gradesCtx, config);
    }

    const yieldCtx = document.getElementById('yieldOverlayChart');
    if (yieldCtx) {
      const { config } = buildYield('widget');
      new Chart(yieldCtx, config);
    }

    document.querySelectorAll('.expand-chart').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.chart;
        if (type === 'grades') {
          const { config, rows } = buildGrades('detail');
          ChartModal.show('AOI Operator Grades', config, ['Operator','Coverage','Grade'], rows);
        } else if (type === 'yield') {
          const { config, rows } = buildYield('detail');
          ChartModal.show('Yield Comparison', config, ['Date','AOI Yield','Final Inspect Yield'], rows);
        }
      });
    });

    // Initialize DataTables if the plugin is available
    if (window.jQuery && $.fn && $.fn.DataTable) {
      const aoiTableEl = document.getElementById('compare-aoi-table');
      const fiTableEl = document.getElementById('compare-fi-table');
      if (aoiTableEl) $(aoiTableEl).DataTable({ paging: false });
      if (fiTableEl) $(fiTableEl).DataTable({ paging: false });
    }

    // Expose row data for future filtering
    window.AOICompare = Object.assign(window.AOICompare || {}, {
      aoiRows: getJSON('aoi-data'),
      fiRows: getJSON('fi-data')
    });

    // Attach click handlers for job-number lookup
    document.querySelectorAll('.comparison-panels table tbody').forEach(tbody => {
      tbody.addEventListener('click', e => {
        const row = e.target.closest('tr');
        if (!row) return;
        const jobCell = row.cells[6];
        if (!jobCell || e.target !== jobCell) return;
        const job = jobCell.textContent.trim();
        if (!job) return;
        fetch(`/analysis/compare/jobs?job_number=${encodeURIComponent(job)}`)
          .then(r => r.json())
          .then(data => {
            console.log('Job details:', data);
          })
          .catch(err => console.error('Failed to fetch job details', err));
      });
    });
  });

  // Placeholder exports for future filtering features
  function filterByJob(jobNumber) {
    console.warn('filterByJob placeholder not implemented', jobNumber);
  }

  function clearJobFilter() {
    console.warn('clearJobFilter placeholder not implemented');
  }

  window.AOICompare = Object.assign(window.AOICompare || {}, {
    filterByJob,
    clearJobFilter
  });
})();
