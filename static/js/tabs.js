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

    const info = document.createElement('div');
    info.className = 'tab-hover-info';
    nav.insertAdjacentElement('afterend', info);
    let hideTimeout;

    links.forEach(link => {
      link.addEventListener('mouseenter', () => {
        const desc = link.dataset.desc || '';
        const more = link.dataset.more || '';
        info.innerHTML = `<p>${desc}</p>${more ? `<details><summary>Read more</summary><p>${more}</p></details>` : ''}`;
        info.classList.add('show');
      });
    });

    nav.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(() => info.classList.remove('show'), 100);
    });

    info.addEventListener('mouseenter', () => {
      clearTimeout(hideTimeout);
    });

    info.addEventListener('mouseleave', () => {
      info.classList.remove('show');
    });
  });
});
