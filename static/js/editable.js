window.addEventListener('DOMContentLoaded', () => {
  const isAdmin = document.body.dataset.admin === 'true';
  if (!isAdmin) return;

  document.querySelectorAll('table').forEach(table => {
    table.addEventListener('dblclick', e => {
      const cell = e.target.closest('td');
      if (!cell || cell.querySelector('input')) return;
      const original = cell.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = original;
      cell.textContent = '';
      cell.appendChild(input);
      input.focus();

      const finish = () => {
        const row = cell.parentElement;
        const cells = Array.from(row.querySelectorAll('td'));
        const originals = cells.map(td => td.textContent);
        const value = input.value.trim();
        cell.removeChild(input);
        cell.textContent = value;
        if (cells.every(td => td.textContent.trim() === '')) {
          const id = row.dataset.id;
          if (!id) {
            cells.forEach((td, i) => td.textContent = originals[i]);
            return;
          }
          fetch(`/part-markings/${id}`, { method: 'DELETE' })
            .then(resp => {
              if (resp.ok) {
                row.remove();
              } else {
                cells.forEach((td, i) => td.textContent = originals[i]);
              }
            })
            .catch(() => {
              cells.forEach((td, i) => td.textContent = originals[i]);
            });
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
