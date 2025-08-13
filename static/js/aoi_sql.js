window.addEventListener('DOMContentLoaded', () => {
  const links = document.querySelectorAll('.tab-link');
  const contents = document.querySelectorAll('.tab-content');
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      contents.forEach(c => c.style.display = 'none');
      link.classList.add('active');
      const tab = document.getElementById(link.dataset.tab);
      if (tab) tab.style.display = 'block';
    });
  });

  const form = document.getElementById('sql-form');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const query = document.getElementById('sql-query').value;
    try {
      const resp = await fetch('/aoi/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await resp.json();
      const table = document.getElementById('sql-result-table');
      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody');
      if (data.error) {
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td>${data.error}</td></tr>`;
        return;
      }
      const cols = data.columns || [];
      thead.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
      tbody.innerHTML = (data.rows || []).map(r => {
        return '<tr>' + cols.map(c => `<td>${r[c]}</td>`).join('') + '</tr>';
      }).join('');
    } catch (err) {
      console.error(err);
    }
  });
});
