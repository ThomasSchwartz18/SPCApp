document.addEventListener('DOMContentLoaded', () => {
  const links = document.querySelectorAll('.tab-link');
  const contents = document.querySelectorAll('.tab-content');
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      link.classList.add('active');
      const target = document.getElementById(link.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
});
