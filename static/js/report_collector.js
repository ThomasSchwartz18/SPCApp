(function(){
  function addToReport(sectionId) {
    const section = document.getElementById(sectionId);
    const previewContainer = document.getElementById('report-preview');
    if (!section || !previewContainer) return;

    const preview = document.createElement('div');
    preview.className = 'report-preview-item';

    const canvas = section.querySelector('canvas');
    if (canvas && canvas.toDataURL) {
      try {
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        preview.appendChild(img);
      } catch (err) {
        console.error('Canvas capture failed', err);
      }
    }

    const table = section.querySelector('table');
    if (table) {
      preview.appendChild(table.cloneNode(true));
    }

    const summary = section.querySelector('.chart-summary');
    if (summary) {
      preview.appendChild(summary.cloneNode(true));
    }

    previewContainer.appendChild(preview);
  }

  window.addToReport = addToReport;
})();
