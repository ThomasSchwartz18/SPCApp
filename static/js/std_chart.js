(function(){
  const verticalLinePlugin = {
    id: 'verticalLines',
    afterDraw(chart, args, opts) {
      const {ctx, chartArea: {top, bottom}, scales: {x}} = chart;
      (opts.lines || []).forEach(line => {
        const xPos = x.getPixelForValue(line.value);
        ctx.save();
        ctx.strokeStyle = line.color || 'black';
        ctx.beginPath();
        ctx.moveTo(xPos, top);
        ctx.lineTo(xPos, bottom);
        ctx.stroke();
        if (line.label) {
          ctx.fillStyle = line.color || 'black';
          ctx.textBaseline = 'top';
          ctx.fillText(line.label, xPos + 4, top + 12);
        }
        ctx.restore();
      });
    }
  };

  window.createStdChartConfig = function(rates, mean, stdev, yMax, options={}) {
    const bins = options.bins || 20;
    const binWidth = yMax / bins;
    const counts = Array(bins).fill(0);
    rates.forEach(r => {
      const idx = Math.min(Math.floor(r / binWidth), bins - 1);
      counts[idx]++;
    });
    const decimals = options.decimals !== undefined ? options.decimals : (binWidth < 1 ? 2 : 1);
    const labels = counts.map((_, i) => `${(i * binWidth).toFixed(decimals)}-${((i + 1) * binWidth).toFixed(decimals)}`);
    const total = rates.length;
    const xVals = counts.map((_, i) => i * binWidth + binWidth / 2);
    const norm = xVals.map(x => (1 / (stdev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) ** 2) / (stdev ** 2)) * total * binWidth);
    const sigmaColor = options.sigmaColor || 'red';
    const lines = [
      { value: mean, color: options.avgColor || 'green', label: `Avg = ${mean.toFixed(decimals)}` },
      { value: mean + stdev, color: sigmaColor, label: '+1\u03C3' },
      { value: mean + 2 * stdev, color: sigmaColor, label: '+2\u03C3' },
      { value: mean + 3 * stdev, color: sigmaColor, label: '+3\u03C3' },
      { value: mean - stdev, color: sigmaColor, label: '-1\u03C3' },
      { value: mean - 2 * stdev, color: sigmaColor, label: '-2\u03C3' },
      { value: mean - 3 * stdev, color: sigmaColor, label: '-3\u03C3' }
    ];
    const config = {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Frequency',
            data: xVals.map((x, i) => ({ x, y: counts[i] })),
            backgroundColor: options.barColor || 'rgba(54, 162, 235, 0.7)',
            borderColor: options.barBorderColor || 'rgba(54, 162, 235, 1)',
            parsing: false
          },
          {
            type: 'line',
            label: 'Normal Dist',
            data: xVals.map((x, i) => ({ x, y: norm[i] })),
            borderColor: options.lineColor || 'rgba(255, 99, 132, 1)',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            parsing: false
          }
        ]
      },
      options: {
        scales: {
          x: { type: 'linear', min: 0, max: yMax },
          y: { beginAtZero: true }
        },
        plugins: { verticalLines: { lines } }
      },
      plugins: [verticalLinePlugin]
    };
    const rows = counts.map((c, i) => [labels[i], c]);
    return { config, rows };
  };
})();
