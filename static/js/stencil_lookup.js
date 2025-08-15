document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-part-number');
  const searchBtn = document.getElementById('search-btn');
  const table = document.querySelector('#stencil-table table');

  function runSearch() {
    const term = searchInput.value.trim();
    if (!term) return;
    const rows = document.querySelectorAll('#stencil-table tbody tr');
    let first = null;
    rows.forEach(row => {
      row.classList.remove('highlight');
      const cell = row.querySelector('.part-number');
      if (cell) {
        const parts = cell.textContent.split(',').map(p => p.trim());
        if (parts.includes(term)) {
          row.classList.add('highlight');
          if (!first) first = row;
        }
      }
    });
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  if (table) {
    const updateUrl = table.dataset.updateUrl;
    table.addEventListener('click', async e => {
      if (!e.target.classList.contains('delete-row')) return;
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      if (!id || !confirm('Delete this entry?')) return;
      try {
        const resp = await fetch(`${updateUrl}/${id}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
          row.remove();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
});
