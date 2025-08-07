window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const start     = params.get('start');
  const end       = params.get('end');
  const threshold = params.get('threshold');
  const yMax      = parseFloat(params.get('ymax')) || 1;
  const ctx       = document.getElementById('popup-chart');
  
  fetch(`/analysis/chart-data?start=${start}&end=${end}&threshold=${threshold}`)
    .then(res => res.json())
    .then(data => {
      const labels = data.map(d => d.model);
      const values = data.map(d => d.rate);
      new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'FalseCall Rate', data: values }] },
        options: { scales: { y: { beginAtZero: true, max: yMax } } }
      });
    })
    .catch(console.error);
});
