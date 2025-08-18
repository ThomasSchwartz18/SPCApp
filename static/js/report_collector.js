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

  async function loadSavedReports() {
    const select = document.getElementById('saved-report-select');
    if (!select) return;
    const res = await fetch('/reports/list');
    const data = await res.json();
    select.innerHTML = '<option value="">Select saved report</option>';
    data.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      select.appendChild(opt);
    });
  }

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

  document.addEventListener('DOMContentLoaded', () => {
    sessionStorage.removeItem(CACHE_KEY);
    loadCachedSelections();
    loadSavedReports();

    document.getElementById('saved-report-select')?.addEventListener('change', async e => {
      const id = e.target.value;
      if (!id) return;
      const data = await fetch(`/reports/${id}`).then(r => r.json());
      sessionStorage.setItem(CACHE_KEY, data.content || '[]');
      loadCachedSelections();
    });

    document.getElementById('save-report')?.addEventListener('click', async () => {
      const name = prompt('Save report as:');
      if (!name) return;
      const content = sessionStorage.getItem(CACHE_KEY) || '[]';
      await fetch('/reports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content })
      });
      await loadSavedReports();
      alert('Report saved');
    });
  });
})();
