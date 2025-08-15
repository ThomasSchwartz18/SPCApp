window.addEventListener('DOMContentLoaded', () => {
  const isAdmin = document.body.dataset.admin === 'true';
  if (!isAdmin) return;

  document.querySelectorAll('table.editable').forEach(table => {
    const updateUrl = table.dataset.updateUrl;
    const fields = (table.dataset.fields || '').split(',').map(f => f.trim());
    table.addEventListener('dblclick', e => {
      const cell = e.target.closest('td');
      if (!cell || cell.querySelector('input') || cell.classList.contains('no-edit')) return;
      const original = cell.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = original;
      cell.textContent = '';
      cell.appendChild(input);
      input.focus();

      const finish = async () => {
        const value = input.value.trim();
        cell.removeChild(input);
        cell.textContent = value;
        const row = cell.parentElement;
        const id = row.dataset.id;
        const field = fields[cell.cellIndex];
        if (!id || !field || !updateUrl) {
          cell.textContent = original;
          return;
        }
        try {
          const resp = await fetch(`${updateUrl}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field, value })
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error || '');
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.every(td => td.textContent.trim() === '')) {
            row.remove();
          }
        } catch (err) {
          cell.textContent = original;
        }
      };

      input.addEventListener('blur', finish);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') {
          input.blur();
        } else if (ev.key === 'Escape') {
          input.value = original;
          input.blur();
        }
      });
    });
  });
});
