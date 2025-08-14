document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('sql-form');
  if (!form) return;
  const queryInput = document.getElementById('sql-query');
  const savedSelect = document.getElementById('saved-queries');
  const SAVED_KEY = 'moatSavedQueries';

  function getSaved() {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}');
  }

  function populateSaved() {
    const saved = getSaved();
    savedSelect.innerHTML = '<option value="">-- Saved Queries --</option>' +
      Object.keys(saved).map(n => `<option value="${n}">${n}</option>`).join('');
  }

  populateSaved();

  document.addEventListener('sql-saved', e => {
    if (e.detail.key === SAVED_KEY) {
      populateSaved();
      savedSelect.value = e.detail.name;
    }
  });

  savedSelect.addEventListener('change', () => {
    const saved = getSaved();
    const name = savedSelect.value;
    queryInput.value = name ? saved[name] : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = queryInput.value;
    try {
      const resp = await fetch('/moat/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        window.createSqlPopup && window.createSqlPopup(query, [{ Error: data.error || 'Error executing query' }], SAVED_KEY);
        return;
      }
      const rows = data.rows || [];
      if (!rows.length) {
        window.createSqlPopup && window.createSqlPopup(query, [{ Result: 'No results' }], SAVED_KEY);
        return;
      }
      window.createSqlPopup && window.createSqlPopup(query, rows, SAVED_KEY);
    } catch (err) {
      window.createSqlPopup && window.createSqlPopup(query, [{ Error: err }], SAVED_KEY);
    }
  });
});
