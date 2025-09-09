document.getElementById('load-report').addEventListener('click', loadReport);

document.getElementById('export-pdf').addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.html(document.getElementById('report'), {
    html2canvas: { scale: 1 },
    callback: pdf => pdf.save('aoi_operator_report.pdf'),
  });
});

async function loadReport() {
  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  const res = await fetch(`/reports/aoi-operators/data?start=${start}&end=${end}`);
  const data = await res.json();

  document.getElementById('total-boards').textContent = data.summary.inspected || 0;
  document.getElementById('total-rejected').textContent = data.summary.rejected || 0;
  document.getElementById('overall-yield').textContent =
    data.summary.yield !== undefined ? (data.summary.yield * 100).toFixed(2) + '%' : '0%';

  const tbody = document.querySelector('#operatorsTable tbody');
  tbody.innerHTML = '';
  data.operators.forEach(o => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${o.operator}</td><td>${o.inspected}</td><td>${o.rejected}</td><td>${(o.yield * 100).toFixed(2)}%</td>`;
    tbody.appendChild(tr);
  });

  const ctx = document.getElementById('operatorsCanvas').getContext('2d');
  if (window.operatorChart) window.operatorChart.destroy();
  window.operatorChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.operators.map(o => o.operator),
      datasets: [{ label: 'Yield %', data: data.operators.map(o => o.yield * 100) }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  });
}

window.addEventListener('DOMContentLoaded', loadReport);
