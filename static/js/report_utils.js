window.exportChartWithTable = function (canvas, tableSelector, title, filename, orientation = 'portrait') {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation });
  const lines = Array.isArray(title) ? title : [title];
  lines.forEach((line, idx) => pdf.text(line, 10, 10 + idx * 10));
  const imgData = canvas.toBase64Image ? canvas.toBase64Image() : canvas.toDataURL('image/png');
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
