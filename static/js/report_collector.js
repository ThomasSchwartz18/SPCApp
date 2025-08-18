// Handles collecting charts/tables into the report preview
(function () {
  const CACHE_KEY = 'report-selections';

  function loadCachedSelections() {
    const previewContainer = document.getElementById('report-preview');
    if (!previewContainer) return;
    previewContainer.innerHTML = '';
    const selections = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '[]');
    selections.forEach(html => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const item = wrapper.firstElementChild;
      if (item) previewContainer.appendChild(item);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    sessionStorage.removeItem(CACHE_KEY);
    loadCachedSelections();
  });

  function saveSelection(html) {
    const selections = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '[]');
    selections.push(html);
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(selections));
  }

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
    saveSelection(preview.outerHTML);
  }

  window.addToReport = addToReport;
})();
