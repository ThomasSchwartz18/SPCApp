document.getElementById('generate-report')?.addEventListener('click', async () => {
  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  if (!start || !end) {
    alert('Please select a start and end date.');
    return;
  }

  const fcPromise = fetch(`/analysis/chart-data?metric=fc&start=${start}&end=${end}`);
  const ngPromise = fetch(`/analysis/chart-data?metric=ng&start=${start}&end=${end}`);
  const aoiPromise = fetch(`/aoi/report-data?start=${start}&end=${end}&freq=daily`);

  const [fcData, ngData, aoiData] = await Promise.all([
    fcPromise.then(r => r.json()),
    ngPromise.then(r => r.json()),
    aoiPromise.then(r => r.json()),
  ]);

  const container = document.getElementById('report-temp');
  container.innerHTML = '';

  const makeCanvas = () => {
    const c = document.createElement('canvas');
    container.appendChild(c);
    return c.getContext('2d');
  };

  const fcCtx = makeCanvas();
  const ngCtx = makeCanvas();
  const opCtx = makeCanvas();
  const yieldCtx = makeCanvas();

  const table = document.createElement('table');
  container.appendChild(table);
  const header = document.createElement('tr');
  ['Assembly', 'Inspected', 'Rejected', 'Yield'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    header.appendChild(th);
  });
  table.appendChild(header);
  aoiData.assemblies.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.assembly}</td>
      <td>${row.inspected}</td>
      <td>${row.rejected}</td>
      <td>${(row.yield * 100).toFixed(2)}%</td>`;
    table.appendChild(tr);
  });

  new Chart(fcCtx, {
    type: 'bar',
    data: {
      labels: fcData.map(r => r.model),
      datasets: [{ label: 'FC Rate', data: fcData.map(r => r.rate) }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  new Chart(ngCtx, {
    type: 'bar',
    data: {
      labels: ngData.map(r => r.model),
      datasets: [{ label: 'NG Rate', data: ngData.map(r => r.rate) }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  new Chart(opCtx, {
    type: 'bar',
    data: {
      labels: aoiData.operators.map(o => o.operator),
      datasets: [{ label: 'Rejected', data: aoiData.operators.map(o => o.rejected) }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  new Chart(yieldCtx, {
    type: 'line',
    data: {
      labels: aoiData.yield_series.map(y => y.period),
      datasets: [{ label: 'Yield %', data: aoiData.yield_series.map(y => y.yield * 100) }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } },
  });

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const addChart = (ctx, title) => {
    const canvas = ctx.canvas;
    const validMime = d => typeof d === 'string' && /^data:image\/(png|jpe?g|webp);/i.test(d);
    let img;
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
    if (!img || !validMime(img)) {
      try {
        img = canvas.toDataURL('image/jpeg', 1.0);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'SecurityError') {
          console.error('Canvas is tainted and cannot be exported', err);
          alert('Unable to add chart: the canvas has been tainted by cross-origin data.');
        } else {
          console.error(err);
        }
        return;
      }
      if (!validMime(img)) {
        console.error('Unsupported image format for PDF export');
        alert('Unable to add chart: unsupported image format.');
        return;
      }
    }
    let imgProps;
    try {
      imgProps = pdf.getImageProperties(img);
    } catch (err) {
      console.error(err);
      alert('Unable to add chart: unsupported image format.');
      return;
    }
    const width = pdf.internal.pageSize.getWidth() - 20;
    const height = (imgProps.height * width) / imgProps.width;
    const type = img.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    pdf.text(title, 10, 10);
    pdf.addImage(img, type, 10, 20, width, height);
  };

  addChart(fcCtx, 'False Call Rate');
  pdf.addPage();
  addChart(ngCtx, 'NG Rate');
  pdf.addPage();
  addChart(opCtx, 'AOI Rejections by Operator');
  pdf.addPage();
  addChart(yieldCtx, 'AOI Yield');
  pdf.addPage();
  pdf.autoTable({ html: table, startY: 10 });

  pdf.save('report.pdf');
});
