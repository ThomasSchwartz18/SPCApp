window.exportChartWithTable = function (canvas, tableSelector, title, filename) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape' });
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
