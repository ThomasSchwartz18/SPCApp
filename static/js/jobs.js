const REFRESH_INTERVAL = 5000;

async function fetchJobs() {
  const res = await fetch('/api/jobs');
  const jobs = await res.json();
  const tbody = document.querySelector('#jobs-table tbody');
  tbody.innerHTML = '';
  jobs.forEach(job => {
    const tr = document.createElement('tr');
    ['id','name','status','location','updated_at'].forEach(key => {
      const td = document.createElement('td');
      td.textContent = job[key];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

document.getElementById('add-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('name').value;
  await fetch('/api/add', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({name})
  });
  document.getElementById('name').value = '';
  fetchJobs();
});

document.getElementById('update-form').addEventListener('submit', async e => {
  e.preventDefault();
  const job_id = document.getElementById('job_id').value;
  const status = document.getElementById('status').value;
  const location = document.getElementById('location').value;
  await fetch('/api/update', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({job_id, status, location})
  });
  document.getElementById('job_id').value = '';
  document.getElementById('location').value = '';
  fetchJobs();
});

// initial load + polling
fetchJobs();
setInterval(fetchJobs, REFRESH_INTERVAL);
