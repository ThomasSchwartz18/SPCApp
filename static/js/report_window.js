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

    const header = document.createElement('div');
    header.className = 'report-window-header';
    header.innerHTML = '<button id="report-add-text">Add Text</button><button id="report-print">Print</button><button id="report-close" title="Close">\u00d7</button>';

    const body = document.createElement('div');
    body.className = 'report-window-body';

    win.appendChild(header);
    win.appendChild(body);
    document.body.appendChild(win);

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

    header.querySelector('#report-close').addEventListener('click', () => {
      win.remove();
      disableDraggables();
    });

    header.querySelector('#report-add-text').addEventListener('click', () => {
      const p = document.createElement('p');
      p.className = 'report-text';
      p.contentEditable = 'true';
      body.appendChild(p);
      p.focus();
      p.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          p.contentEditable = 'false';
          p.blur();
        }
      });
    });

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
      body.appendChild(wrapper);
    });

    header.querySelector('#report-print').addEventListener('click', () => {
      if (!window.jspdf || !window.html2canvas) return;
      const { jsPDF } = window.jspdf;
      html2canvas(body).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'pt', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = canvas.height * pdfWidth / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('report.pdf');
      });
    });

    initDraggables();
  };
})();
