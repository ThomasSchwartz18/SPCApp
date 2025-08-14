document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-part-number');
  const searchBtn = document.getElementById('search-btn');
  const table = document.querySelector('#markings-table table');

  function runSearch() {
    const term = searchInput.value.trim();
    if (!term) return;
    const rows = document.querySelectorAll('#markings-table tbody tr');
    let target = null;
    rows.forEach(row => {
      row.classList.remove('highlight');
      const cell = row.querySelector('.part-number');
      if (cell && cell.textContent.trim() === term) {
        target = row;
      }
    });
    if (target) {
      target.classList.add('highlight');
      target.scrollIntoView({behavior: 'smooth', block: 'center'});
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
    table.addEventListener('click', async e => {
      if (!e.target.classList.contains('delete-row')) return;
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      if (!id || !confirm('Delete this entry?')) return;
      try {
        const resp = await fetch(`/part-markings/${id}`, { method: 'DELETE' });
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
