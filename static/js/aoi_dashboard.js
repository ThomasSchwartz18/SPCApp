window.addEventListener('DOMContentLoaded', () => {
  const dataEl = document.getElementById('operator-data');
  if (dataEl) {
    const ops = JSON.parse(dataEl.textContent);
    const ctx = document.getElementById('operatorsChart');
    if (ctx && ops.length) {
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
  if (window.jQuery) {
    $('#assemblyTable').DataTable();
  }
});

