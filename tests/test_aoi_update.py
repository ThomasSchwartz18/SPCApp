import os
import sys
import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from run import app, init_db, get_db


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / 'test.db'
    monkeypatch.setattr('run.DATABASE', str(db_path))
    app.config['WTF_CSRF_ENABLED'] = False
    init_db()
    conn = get_db()
    conn.execute(
        "INSERT INTO users (username, password, aoi) VALUES (?,?,1)",
        ('editor', 'pw'),
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        yield client


def test_update_job_number(client):
    conn = get_db()
    conn.execute(
        "INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-01', '1st', 'Op1', 'Cust', 'Asm', 'R1', '', 10, 0, ''),
    )
    row_id = conn.execute('SELECT id FROM aoi_reports').fetchone()['id']
    conn.commit()
    conn.close()
    with client.session_transaction() as sess:
        sess['user'] = 'editor'
    resp = client.patch(
        f'/aoi/{row_id}',
        json={'field': 'job_number', 'value': 'J123'},
    )
    assert resp.status_code == 200
    assert resp.get_json()['success']
    conn = get_db()
    job = conn.execute('SELECT job_number FROM aoi_reports WHERE id = ?', (row_id,)).fetchone()['job_number']
    conn.close()
    assert job == 'J123'
