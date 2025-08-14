(function() {
  const STORAGE_KEY = 'sqlPopups';
  let popups = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(popups));
  }

  function createPopup(data) {
    const { id, query, rows, top, left, collapsed, saveKey } = data;
    const popup = document.createElement('div');
    popup.className = 'sql-popup';
    popup.dataset.id = id;
    popup.style.top = top || '20px';
    popup.style.left = left || '20px';

    const header = document.createElement('div');
    header.className = 'sql-popup-header';
    header.innerHTML = '<span>SQL Result</span><div><button class="min-btn" title="Minimize">_</button><button class="close-btn" title="Close">×</button></div>';

    const body = document.createElement('div');
    body.className = 'sql-popup-body';

    if (saveKey) {
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save Query';
      saveBtn.addEventListener('click', () => {
        const name = prompt('Save query as:');
        if (name) {
          const saved = JSON.parse(localStorage.getItem(saveKey) || '{}');
          saved[name] = query;
          localStorage.setItem(saveKey, JSON.stringify(saved));
          document.dispatchEvent(new CustomEvent('sql-saved', { detail: { key: saveKey, name } }));
        }
      });
      body.appendChild(saveBtn);
    }

    const pre = document.createElement('pre');
    pre.textContent = query;
    body.appendChild(pre);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      thead.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
      tbody.innerHTML = rows.map(r => '<tr>' + cols.map(c => `<td>${r[c]}</td>`).join('') + '</tr>').join('');
    } else {
      tbody.innerHTML = '<tr><td>No results</td></tr>';
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    body.appendChild(table);

    popup.appendChild(header);
    popup.appendChild(body);
    if (collapsed) popup.classList.add('collapsed');
    document.body.appendChild(popup);

    // Dragging logic
    let offsetX = 0, offsetY = 0, dragging = false;
    header.addEventListener('mousedown', e => {
      dragging = true;
      offsetX = e.clientX - popup.offsetLeft;
      offsetY = e.clientY - popup.offsetTop;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    function move(e) {
      if (!dragging) return;
      popup.style.left = (e.clientX - offsetX) + 'px';
      popup.style.top = (e.clientY - offsetY) + 'px';
    }

    function up() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      const p = popups.find(p => p.id === id);
      if (p) {
        p.top = popup.style.top;
        p.left = popup.style.left;
        save();
      }
    }

    header.querySelector('.close-btn').addEventListener('click', () => {
      popup.remove();
      popups = popups.filter(p => p.id !== id);
      save();
    });

    header.querySelector('.min-btn').addEventListener('click', () => {
      popup.classList.toggle('collapsed');
      const p = popups.find(p => p.id === id);
      if (p) {
        p.collapsed = popup.classList.contains('collapsed');
        save();
      }
    });
  }

  window.createSqlPopup = function(query, rows, saveKey) {
    const offset = document.querySelectorAll('.sql-popup').length * 30;
    const data = {
      id: Date.now().toString(),
      query,
      rows,
      top: (20 + offset) + 'px',
      left: (20 + offset) + 'px',
      collapsed: false,
      saveKey
    };
    popups.push(data);
    save();
    createPopup(data);
  };

  document.addEventListener('DOMContentLoaded', () => {
    popups.forEach(createPopup);
  });
})();
