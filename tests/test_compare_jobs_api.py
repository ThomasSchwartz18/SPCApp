import os
import sys
import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from run import app, init_db, get_db


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / 'test.db'
    monkeypatch.setattr('run.DATABASE', str(db_path))
    init_db()
    conn = get_db()
    conn.execute(
        "INSERT INTO users (username, password, analysis) VALUES (?,?,1)",
        ('tester', 'pw'),
    )
    conn.execute(
        "INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-01', '1st', 'Alice', 'Cust1', 'Asm1', 'R1', 'J100', 10, 1, ''),
    )
    conn.execute(
        "INSERT INTO fi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-01', '1st', 'Bob', 'Cust1', 'Asm1', 'R1', 'J100', 20, 2, ''),
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['user'] = 'tester'
        yield client


def test_compare_jobs_endpoint(client):
    resp = client.get('/analysis/compare/jobs?job_number=J100')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['job_number'] == 'J100'
    assert data['aoi']['operator'] == 'Alice'
    assert data['fi']['operator'] == 'Bob'
    assert data['aoi']['yield'] == pytest.approx(0.9)
    assert data['fi']['yield'] == pytest.approx(0.9)
