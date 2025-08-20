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
    header.innerHTML = '<button id="report-add-text">Add Text</button>' +
      '<button id="report-add-h1">Add Header 1</button>' +
      '<button id="report-add-h2">Add Header 2</button>' +
      '<label>Margin:<select id="report-margin">' +
      '<option value="0.25">0.25\"</option>' +
      '<option value="0.5" selected>0.5\"</option>' +
      '<option value="0.75">0.75\"</option>' +
      '<option value="1">1\"</option>' +
      '</select></label>' +
      '<div class="right"><button id="report-print">Print</button>' +
      '<button id="report-close" title="Close">\u00d7</button></div>';

    const body = document.createElement('div');
    body.className = 'report-window-body';

    const marginSelect = header.querySelector('#report-margin');

    function createPage() {
      const page = document.createElement('div');
      page.className = 'report-page';
      const marginPx = (parseFloat(marginSelect.value) || 0) * 96;
      page.style.padding = marginPx + 'px';
      return page;
    }

    const saved = localStorage.getItem('report-content');
    if (saved) {
      body.innerHTML = saved;
    } else {
      body.appendChild(createPage());
    }

    win.appendChild(header);
    win.appendChild(body);
    document.body.appendChild(win);

    function save() {
      localStorage.setItem('report-content', body.innerHTML);
    }

    function makeReportItemResizable(wrapper) {
      wrapper.addEventListener('mouseup', () => {
        wrapper.style.width = wrapper.offsetWidth + 'px';
        wrapper.style.height = wrapper.offsetHeight + 'px';
        save();
      });
    }

    body.querySelectorAll('.report-item').forEach(makeReportItemResizable);

    // dragging
    let offsetX = 0, offsetY = 0, dragging = false;
    header.addEventListener('mousedown', e => {
      if (['BUTTON', 'SELECT', 'OPTION', 'LABEL'].includes(e.target.tagName)) return;
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

    let suppressSave = false;
    function addToPage(node) {
      let page = body.lastElementChild;
      page.appendChild(node);
      const style = getComputedStyle(page);
      const padTop = parseFloat(style.paddingTop || 0);
      const padBottom = parseFloat(style.paddingBottom || 0);
      const usable = page.clientHeight - padTop - padBottom;
      if (node.offsetTop + node.offsetHeight - padTop > usable) {
        page.removeChild(node);
        page = createPage();
        body.appendChild(page);
        page.appendChild(node);
      }
      if (!suppressSave) save();
    }

    function applyMargin(reflow = false) {
      const marginPx = (parseFloat(marginSelect.value) || 0) * 96;
      body.querySelectorAll('.report-page').forEach(p => p.style.padding = marginPx + 'px');
      if (reflow) {
        const items = Array.from(body.querySelectorAll('.report-page > *'));
        suppressSave = true;
        body.innerHTML = '';
        body.appendChild(createPage());
        items.forEach(item => addToPage(item));
        suppressSave = false;
        save();
      }
    }

    marginSelect.addEventListener('change', () => applyMargin(true));
    applyMargin(true);

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
      img.addEventListener('load', () => {
        wrapper.style.width = img.naturalWidth + 'px';
        wrapper.style.height = img.naturalHeight + 'px';
        wrapper.style.aspectRatio = img.naturalWidth + '/' + img.naturalHeight;
        save();
      });
      wrapper.appendChild(img);
      makeReportItemResizable(wrapper);
      addToPage(wrapper);
    });

    header.querySelector('#report-print').addEventListener('click', async () => {
      if (!window.jspdf || !window.html2canvas) return;
      const { jsPDF } = window.jspdf;
      const pxToPt = 72 / 96; // convert CSS pixels to PDF points
      const pdf = new jsPDF('l', 'pt', 'a4');
      const pages = body.querySelectorAll('.report-page');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const ratio = Math.min(
          pageWidth / (canvas.width * pxToPt),
          pageHeight / (canvas.height * pxToPt)
        );
        const imgWidth = canvas.width * pxToPt * ratio;
        const imgHeight = canvas.height * pxToPt * ratio;
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        if (i < pages.length - 1) pdf.addPage('l');
      }
      pdf.save('report.pdf');
    });

    window.addEventListener('beforeunload', save);

    initDraggables();
  };
})();
