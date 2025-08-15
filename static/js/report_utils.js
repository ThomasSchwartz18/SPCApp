window.exportChartWithTable = function (canvas, tableSelector, title, filename, orientation = 'portrait') {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation });
  const lines = Array.isArray(title) ? title : [title];
  lines.forEach((line, idx) => pdf.text(line, 10, 10 + idx * 10));
  const validMime = data => typeof data === 'string' && /^data:image\/(png|jpe?g|webp);/i.test(data);
  let imgData;
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
        alert('Unable to export chart: the canvas has been tainted by cross-origin data.');
        return;
      }
    } else {
      console.error(err);
      return;
    }
  }
  if (!imgData || !validMime(imgData)) {
    try {
      imgData = canvas.toDataURL('image/jpeg', 1.0);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'SecurityError') {
        console.error('Canvas is tainted and cannot be exported', err);
        alert('Unable to export chart: the canvas has been tainted by cross-origin data.');
      } else {
        console.error(err);
      }
      return;
    }
    if (!validMime(imgData)) {
      console.error('Unsupported image format for export');
      alert('Unable to export chart: unsupported image format.');
      return;
    }
  }
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  const imgY = 20 + (lines.length - 1) * 10;
  pdf.addImage(imgData, 'PNG', 10, imgY, pdfWidth, pdfHeight);
  pdf.addPage('portrait');
  pdf.autoTable({ html: tableSelector, startY: 10 });
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
