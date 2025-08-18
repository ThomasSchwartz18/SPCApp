 (function() {
  function makeCanvasDraggable(canvas) {
    if (!document.getElementById('report-window')) {
      canvas.removeAttribute('draggable');
      delete canvas.dataset.draggableReady;
      return;
    }
    if (canvas.dataset.draggableReady) return;
    canvas.dataset.draggableReady = 'true';
    canvas.setAttribute('draggable', 'true');
    canvas.addEventListener('dragstart', e => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        e.dataTransfer.setData('text/plain', dataUrl);
      } catch (err) {
        console.error('Failed to export canvas', err);
      }
    });
  }

  function initDraggables(root = document) {
    root.querySelectorAll && root.querySelectorAll('canvas').forEach(makeCanvasDraggable);
  }

  function disableDraggables(root = document) {
    root.querySelectorAll && root.querySelectorAll('canvas').forEach(c => {
      c.removeAttribute('draggable');
      delete c.dataset.draggableReady;
    });
  }

  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'CANVAS') {
          makeCanvasDraggable(node);
        } else {
          initDraggables(node);
        }
      });
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    initDraggables();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.openReportWindow = function() {
    if (document.getElementById('report-window')) return;

    const win = document.createElement('div');
    win.id = 'report-window';
    win.className = 'report-window';
    localStorage.setItem('report-window-open', 'true');

    const header = document.createElement('div');
    header.className = 'report-window-header';
    header.innerHTML = '<button id="report-add-text">Add Text</button><button id="report-add-h1">Add Header 1</button><button id="report-add-h2">Add Header 2</button><div class="right"><button id="report-print">Print</button><button id="report-close" title="Close">\u00d7</button></div>';

    const body = document.createElement('div');
    body.className = 'report-window-body';

    const saved = localStorage.getItem('report-content');
    if (saved) {
      body.innerHTML = saved;
    } else {
      const firstPage = document.createElement('div');
      firstPage.className = 'report-page';
      body.appendChild(firstPage);
    }

    win.appendChild(header);
    win.appendChild(body);
    document.body.appendChild(win);

    function save() {
      localStorage.setItem('report-content', body.innerHTML);
    }

    // dragging
    let offsetX = 0, offsetY = 0, dragging = false;
    header.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      offsetX = e.clientX - win.offsetLeft;
      offsetY = e.clientY - win.offsetTop;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    function move(e) {
      if (!dragging) return;
      win.style.left = (e.clientX - offsetX) + 'px';
      win.style.top = (e.clientY - offsetY) + 'px';
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }

    function addToPage(node) {
      let page = body.lastElementChild;
      page.appendChild(node);
      if (page.scrollHeight > page.clientHeight) {
        page.removeChild(node);
        page = document.createElement('div');
        page.className = 'report-page';
        body.appendChild(page);
        page.appendChild(node);
      }
      save();
    }

    header.querySelector('#report-close').addEventListener('click', () => {
      win.remove();
      disableDraggables();
      localStorage.removeItem('report-window-open');
      localStorage.removeItem('report-content');
    });

    function addEditable(tag) {
      const el = document.createElement(tag);
      el.className = 'report-text';
      el.contentEditable = 'true';
      addToPage(el);
      el.focus();
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          el.contentEditable = 'false';
          el.blur();
          save();
        }
      });
    }

    header.querySelector('#report-add-text').addEventListener('click', () => addEditable('p'));
    header.querySelector('#report-add-h1').addEventListener('click', () => addEditable('h1'));
    header.querySelector('#report-add-h2').addEventListener('click', () => addEditable('h2'));

    body.addEventListener('dragover', e => e.preventDefault());
    body.addEventListener('drop', e => {
      e.preventDefault();
      const dataUrl = e.dataTransfer.getData('text/plain');
      if (!dataUrl) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'report-item';
      const img = document.createElement('img');
      img.src = dataUrl;
      wrapper.appendChild(img);
      addToPage(wrapper);
    });

    header.querySelector('#report-print').addEventListener('click', async () => {
      if (!window.jspdf || !window.html2canvas) return;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pages = body.querySelectorAll('.report-page');
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        if (i < pages.length - 1) pdf.addPage();
      }
      pdf.save('report.pdf');
    });

    window.addEventListener('beforeunload', save);

    initDraggables();
  };
})();
