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
        const value = input.value.trim();
        cell.removeChild(input);
        cell.textContent = value;
        const row = cell.parentElement;
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.every(td => td.textContent.trim() === '')) {
          row.remove();
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
