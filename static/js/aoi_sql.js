document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('sql-form');
  if (!form) return;
  const queryInput = document.getElementById('sql-query');
  const savedSelect = document.getElementById('saved-queries');
  const SAVED_KEY = 'aoiSavedQueries';

  function getSaved() {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}');
  }

  function populateSaved() {
    const saved = getSaved();
    savedSelect.innerHTML = '<option value="">-- Saved Queries --</option>' +
      Object.keys(saved).map(n => `<option value="${n}">${n}</option>`).join('');
  }

  populateSaved();

  savedSelect.addEventListener('change', () => {
    const saved = getSaved();
    const name = savedSelect.value;
    queryInput.value = name ? saved[name] : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = queryInput.value;
    try {
      const resp = await fetch('/aoi/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        showPopup(query, [{ Error: data.error || 'Error executing query' }]);
        return;
      }
      const rows = data.rows || [];
      if (!rows.length) {
        showPopup(query, [{ Result: 'No results' }]);
        return;
      }
      showPopup(query, rows);
    } catch (err) {
      showPopup(query, [{ Error: err }]);
    }
  });

  function showPopup(query, rows) {
    const popup = document.createElement('div');
    popup.className = 'sql-popup';
    const offset = document.querySelectorAll('.sql-popup').length * 30;
    popup.style.top = (20 + offset) + 'px';
    popup.style.left = (20 + offset) + 'px';

    const header = document.createElement('div');
    header.className = 'sql-popup-header';
    header.innerHTML = '<span>SQL Result</span><div><button class="min-btn" title="Minimize">_</button><button class="close-btn" title="Close">×</button></div>';

    const body = document.createElement('div');
    body.className = 'sql-popup-body';
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Query';
    const pre = document.createElement('pre');
    pre.textContent = query;

    body.appendChild(saveBtn);
    body.appendChild(pre);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      thead.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
      tbody.innerHTML = rows.map(r => '<tr>' + cols.map(c => `<td>${r[c]}</td>`).join('') + '</tr>').join('');
    } else {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td>No results</td></tr>';
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    body.appendChild(table);

    popup.appendChild(header);
    popup.appendChild(body);
    document.body.appendChild(popup);

    header.querySelector('.close-btn').addEventListener('click', () => popup.remove());
    header.querySelector('.min-btn').addEventListener('click', () => popup.classList.toggle('collapsed'));
    saveBtn.addEventListener('click', () => {
      const name = prompt('Save query as:');
      if (name) {
        const saved = getSaved();
        saved[name] = query;
        localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
        populateSaved();
        savedSelect.value = name;
      }
    });
  }
});
