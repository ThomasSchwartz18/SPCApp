document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('sql-form');
  if (!form) return;
  const queryInput = document.getElementById('sql-query');
  const table = document.getElementById('sql-results');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

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
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td>${data.error || 'Error executing query'}</td></tr>`;
        return;
      }
      const rows = data.rows || [];
      if (!rows.length) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td>No results</td></tr>';
        return;
      }
      const cols = Object.keys(rows[0]);
      thead.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
      tbody.innerHTML = rows.map(r => {
        return '<tr>' + cols.map(c => `<td>${r[c]}</td>`).join('') + '</tr>';
      }).join('');
    } catch (err) {
      thead.innerHTML = '';
      tbody.innerHTML = `<tr><td>${err}</td></tr>`;
    }
  });
});
