document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-nav').forEach(nav => {
    const links = nav.querySelectorAll('.tab-link');
    const container = nav.parentElement;
    const contents = Array.from(container.children).filter(el =>
      el.classList.contains('tab-content')
    );

    links.forEach(link => {
      link.addEventListener('click', () => {
        links.forEach(l => l.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        link.classList.add('active');
        const target = container.querySelector(`#${link.dataset.tab}`);
        if (target) target.classList.add('active');
      });
    });
  });
});
