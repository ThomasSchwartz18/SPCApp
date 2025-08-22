// operator_grades.js
// Render bar chart of AOI operator grades
(function () {
  const getJSON = id => {
    const el = document.getElementById(id);
    if (!el) return [];
    try {
      return JSON.parse(el.textContent || '[]');
    } catch {
      return [];
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const grades = getJSON('grade-data');
    const labels = grades.map(g => g.operator || '');
    const data = grades.map(g =>
      g.coverage == null ? 0 : Math.round(g.coverage * 10000) / 100
    );
    const colors = grades.map(g => {
      if (g.grade == null) return 'gray';
      switch (g.grade) {
        case 'A':
          return 'green';
        case 'B':
          return 'blue';
        case 'C':
          return 'orange';
        default:
          return 'red';
      }
    });

    const ctx = document.getElementById('operatorGradesChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Detection Coverage (%)',
              data,
              backgroundColor: colors
            }
          ]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              max: 100
            }
          }
        }
      });
    }
  });
})();
