import os
import sys
import math
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


def test_operator_grades_requires_login(client):
    resp = client.get('/analysis/operator-grades', follow_redirects=False)
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_operator_grades_requires_permission(client):
    with client.session_transaction() as sess:
        sess['user'] = 'noperm'
    resp = client.get('/analysis/operator-grades', follow_redirects=False)
    assert resp.status_code == 302
    assert '/analysis' in resp.headers['Location']


def test_operator_grades_json(client):
    conn = get_db()
    conn.execute(
        "INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-01', '1st', 'Jim', 'Cust', 'Asm1', 'R1', 'J1', 100, 2, ''),
    )
    conn.execute(
        "INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-02', '1st', 'Jane', 'Cust', 'Asm2', 'R1', 'J2', 100, 5, ''),
    )
    conn.execute(
        "INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-05', '1st', 'Bob', 'Cust', 'Asm3', 'R1', 'J3', 100, 3, ''),
    )
    conn.execute(
        "INSERT INTO fi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-03', '1st', 'Sam', 'Cust', 'Asm1', 'R1', 'J1', 100, 6, ''),
    )
    conn.execute(
        "INSERT INTO fi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-01-04', '1st', 'Sue', 'Cust', 'Asm2', 'R1', 'J2', 100, 1, ''),
    )
    conn.commit()
    conn.close()

    with client.session_transaction() as sess:
        sess['user'] = 'analyst'
    resp = client.get('/analysis/operator-grades?format=json')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'grades' in data
    grades = {g['operator']: g for g in data['grades']}
    assert math.isclose(grades['Jim']['coverage'], 0.25)
    assert grades['Jim']['grade'] == 'D'
    assert math.isclose(grades['Jane']['coverage'], 5 / 6)
    assert grades['Jane']['grade'] == 'A'
    assert grades['Bob']['coverage'] is None
    assert grades['Bob']['grade'] is None


def test_operator_grades_multiple_operators(client):
    """FI defects are split based on each operator's inspection share."""
    conn = get_db()
    # Two operators on the same job with different inspected quantities
    conn.execute(
        "INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-02-01', '1st', 'Alice', 'Cust', 'Asm1', 'R1', 'J100', 80, 8, ''),
    )
    conn.execute(
        "INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-02-01', '1st', 'Bob', 'Cust', 'Asm1', 'R1', 'J100', 20, 1, ''),
    )
    # FI report totals for the job
    conn.execute(
        "INSERT INTO fi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('2024-02-02', '1st', 'Frank', 'Cust', 'Asm1', 'R1', 'J100', 100, 30, ''),
    )
    conn.commit()
    conn.close()

    with client.session_transaction() as sess:
        sess['user'] = 'analyst'
    resp = client.get('/analysis/operator-grades?format=json')
    assert resp.status_code == 200
    data = resp.get_json()
    grades = {g['operator']: g for g in data['grades']}

    # FI rejects should be split 24/6 between Alice and Bob
    assert math.isclose(grades['Alice']['coverage'], 8 / (8 + 24))
    assert math.isclose(grades['Bob']['coverage'], 1 / (1 + 6))
    assert grades['Alice']['grade'] == 'D'
    assert grades['Bob']['grade'] == 'D'
