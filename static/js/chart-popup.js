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
      const inRangeValues = data.map(d => (d.rate <= yMax ? d.rate : null));
      const outliers = data.filter(d => d.rate > yMax);
      new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'FalseCall Rate',
              data: inRangeValues,
              borderColor: 'black',
              pointBackgroundColor: 'black',
              pointBorderColor: 'black',
              fill: false,
              tension: 0,
              clip: false
            },
            {
              label: 'Outliers',
              data: outliers.map(d => ({ x: d.model, y: yMax, real: d.rate })),
              borderColor: 'red',
              pointBackgroundColor: 'red',
              pointBorderColor: 'red',
              showLine: false,
              pointStyle: 'triangle',
              rotation: 180,
              clip: false
            }
          ]
        },
        options: {
          layout: { padding: { top: 20 } },
          scales: { y: { beginAtZero: true, max: yMax } },
          plugins: {
            tooltip: {
              callbacks: {
                label: ctx => {
                  if (ctx.dataset.label === 'Outliers') {
                    return `${ctx.label}: ${ctx.raw.real}`;
                  }
                  return `${ctx.dataset.label}: ${ctx.parsed.y}`;
                }
              }
            }
          }
        }
      });
    })
    .catch(console.error);
});
