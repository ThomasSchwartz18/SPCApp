document.addEventListener('DOMContentLoaded', () => {
  const aoiSeries = JSON.parse(document.getElementById('aoi-series').textContent || '[]');
  const fiSeries = JSON.parse(document.getElementById('fi-series').textContent || '[]');

  const dates = Array.from(new Set([
    ...aoiSeries.map(r => r.date),
    ...fiSeries.map(r => r.date)
  ])).sort();

  const aoiMap = Object.fromEntries(aoiSeries.map(r => [r.date, r.yield]));
  const fiMap = Object.fromEntries(fiSeries.map(r => [r.date, r.yield]));

  const ctx = document.getElementById('yieldOverlayChart');
  if (ctx) {
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
            suggestedMin: 0,
            suggestedMax: 1
          }
        }
      }
    });
  }
});

