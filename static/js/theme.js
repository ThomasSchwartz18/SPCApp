document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.body.classList.add('dark-mode');
    toggle.textContent = 'Light Mode';
    toggle.classList.remove('btn-light');
    toggle.classList.add('btn-dark');
  }
  toggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    toggle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    toggle.classList.toggle('btn-light', !isDark);
    toggle.classList.toggle('btn-dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
});
