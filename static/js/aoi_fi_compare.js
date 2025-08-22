// aoi_fi_compare.js
// Build comparison chart and tables for AOI vs Final Inspect data

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

  document.addEventListener('DOMContentLoaded', () => {
    const aoiSeries = getJSON('aoi-series');
    const fiSeries = getJSON('fi-series');

    const dates = Array.from(
      new Set([...aoiSeries.map(r => r.date), ...fiSeries.map(r => r.date)])
    ).sort();

    const aoiMap = Object.fromEntries(aoiSeries.map(r => [r.date, r.yield]));
    const fiMap = Object.fromEntries(fiSeries.map(r => [r.date, r.yield]));

    const ctx = document.getElementById('yieldOverlayChart');
    if (ctx) {
      const aoiVals = dates.map(d => aoiMap[d]).filter(v => v != null);
      const fiVals = dates.map(d => fiMap[d]).filter(v => v != null);
      const allVals = aoiVals.concat(fiVals);
      const minVal = allVals.length ? Math.min(...allVals) : 0.8;
      const yMin = minVal < 0.8 ? minVal : 0.8;
      new Chart(ctx, {
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
            y: {
              min: yMin,
              max: 1
            }
          }
        }
      });
    }

    // Initialize DataTables if the plugin is available
    if (window.jQuery && $.fn && $.fn.DataTable) {
      const aoiTableEl = document.querySelector(
        '.comparison-panels details:nth-of-type(1) table'
      );
      const fiTableEl = document.querySelector(
        '.comparison-panels details:nth-of-type(2) table'
      );
      if (aoiTableEl) $(aoiTableEl).DataTable();
      if (fiTableEl) $(fiTableEl).DataTable();
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
            // TODO: display correlated details in a modal instead of console
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

