window.exportChartWithTable = function (
  canvas,
  tableSelector,
  title,
  filename,
  orientation = 'landscape',
  marginInches = 0.5
) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation });
  const margin = marginInches * 25.4;
  const lines = Array.isArray(title) ? title : [title];
  lines.forEach((line, idx) => pdf.text(line, margin, margin + idx * 10));
  const validMime = data => typeof data === 'string' && /^data:image\/(png|jpe?g|webp);/i.test(data);
  let imgData;
  let useHtml = false;
  try {
    imgData = canvas.toBase64Image ? canvas.toBase64Image() : canvas.toDataURL('image/png');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'SecurityError') {
      try {
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        tmp.getContext('2d').drawImage(canvas, 0, 0);
        imgData = tmp.toDataURL('image/png');
      } catch (err2) {
        console.error('Canvas is tainted and cannot be exported', err2);
        useHtml = true;
      }
    } else {
      console.error(err);
      useHtml = true;
    }
  }
  if (!useHtml && (!imgData || !validMime(imgData))) {
    try {
      imgData = canvas.toDataURL('image/jpeg', 1.0);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'SecurityError') {
        console.error('Canvas is tainted and cannot be exported', err);
      } else {
        console.error(err);
      }
      useHtml = true;
    }
    if (!useHtml && !validMime(imgData)) {
      console.error('Unsupported image format for export');
      useHtml = true;
    }
  }
  if (useHtml) {
    const table = document.querySelector(tableSelector);
    const wrapper = document.createElement('div');
    lines.forEach(text => {
      const p = document.createElement('p');
      p.textContent = text;
      wrapper.appendChild(p);
    });
    wrapper.appendChild(canvas.cloneNode(true));
    if (table) wrapper.appendChild(table.cloneNode(true));
    pdf.html(wrapper, { callback: pdf => pdf.save(filename) });
    return;
  }
  const imgProps = pdf.getImageProperties(imgData);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let pdfWidth = pageWidth - margin * 2;
  let pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  const imgY = margin + lines.length * 10;
  if (imgY + pdfHeight > pageHeight - margin) {
    pdfHeight = pageHeight - margin - imgY;
    pdfWidth = (imgProps.width * pdfHeight) / imgProps.height;
  }
  pdf.addImage(imgData, 'PNG', margin, imgY, pdfWidth, pdfHeight);
  pdf.addPage('landscape');
  pdf.autoTable({ html: tableSelector, startY: margin, margin: { left: margin, right: margin, top: margin } });
  pdf.save(filename);
};

window.exportTableToExcel = function (tableSelector, filename) {
  const table = document.querySelector(tableSelector);
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  const csv = rows
    .map(row =>
      Array.from(row.querySelectorAll('th,td'))
        .map(cell => '"' + cell.textContent.replace(/"/g, '""') + '"')
        .join(',')
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};
