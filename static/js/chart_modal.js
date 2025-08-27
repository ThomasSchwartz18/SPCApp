(function() {
  function show(title, config, headers = [], rows = []) {
    const modalEl = document.getElementById('chart-modal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const modalTitle = modalEl.querySelector('.modal-title');
    const modalCanvas = modalEl.querySelector('canvas');
    const modalHead = modalEl.querySelector('thead');
    const modalBody = modalEl.querySelector('tbody');
    if (window.ChartModalChart) {
      window.ChartModalChart.destroy();
    }
    modalTitle.textContent = title;
    config.options = Object.assign({}, config.options, {
      responsive: true,
      maintainAspectRatio: false
    });
    window.ChartModalChart = new Chart(modalCanvas, config);
    if (headers.length) {
      modalHead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
      modalBody.innerHTML = rows
        .map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>')
        .join('');
    } else {
      modalHead.innerHTML = '';
      modalBody.innerHTML = '';
    }
    modal.show();
  }
  window.ChartModal = { show };
})();
