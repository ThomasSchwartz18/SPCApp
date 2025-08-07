document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-part-number');
  const searchBtn = document.getElementById('search-btn');

  function runSearch() {
    const term = searchInput.value.trim();
    if (!term) return;
    const rows = document.querySelectorAll('#markings-table tbody tr');
    let target = null;
    rows.forEach(row => {
      row.classList.remove('highlight');
      const cell = row.cells[row.cells.length - 1]; // Part Number column
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
});
