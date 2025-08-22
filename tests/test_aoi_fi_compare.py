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
    # users: one with analysis permission, one without
    conn.execute(
        "INSERT INTO users (username, password, analysis) VALUES (?,?,1)",
        ('analyst', 'pw'),
    )
    conn.execute(
        "INSERT INTO users (username, password, analysis) VALUES (?,?,0)",
        ('noperm', 'pw'),
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        yield client


def test_compare_requires_login(client):
    resp = client.get('/analysis/compare', follow_redirects=False)
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_compare_requires_permission(client):
    with client.session_transaction() as sess:
        sess['user'] = 'noperm'
    resp = client.get('/analysis/compare', follow_redirects=False)
    assert resp.status_code == 302
    assert '/analysis' in resp.headers['Location']


def test_compare_page_renders(client):
    with client.session_transaction() as sess:
        sess['user'] = 'analyst'
    resp = client.get('/analysis/compare')
    assert resp.status_code == 200
    assert b'yieldOverlayChart' in resp.data
    assert b'operatorGradesChart' in resp.data


def test_compare_jobs_json(client):
    # insert sample AOI and FI records
    conn = get_db()
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
    with client.session_transaction() as sess:
        sess['user'] = 'analyst'
    resp = client.get('/analysis/compare/jobs?job_number=J100')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['job_number'] == 'J100'
    assert 'aoi' in data and 'fi' in data
