import os
import os
import sys
import pandas as pd
import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from run import parse_aoi_rows, app, init_db, get_db


def test_parse_aoi_rows(tmp_path):
    data = [
        ['Alice', 'Cust1', 'Asm1', 'R1', 'J100', 10, 1, 'note1'],
        ['Bob', 'Cust2', 'Asm2', 'R2', 'J200', 20, 2, 'note2'],
    ]
    file = tmp_path / 'aoi.xlsx'
    pd.DataFrame(data).to_excel(file, header=False, index=False)
    rows = parse_aoi_rows(str(file))
    assert rows[0]['operator'] == 'Alice'
    assert rows[1]['qty_rejected'] == 2
    assert rows[0]['rev'] == 'R1'


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / 'test.db'
    monkeypatch.setattr('run.DATABASE', str(db_path))
    init_db()
    conn = get_db()
    conn.execute(
        "INSERT INTO users (username, password, aoi) VALUES (?,?,1)",
        ('tester', 'pw')
    )
    data = [
        ('2024-01-01', '1st', 'Alice', 'Cust1', 'Asm1', 'R1', 'J100', 10, 1, ''),
        ('2024-01-02', '1st', 'Alice', 'Cust1', 'Asm1', 'R1', 'J100', 15, 0, ''),
        ('2024-01-01', '2nd', 'Bob', 'Cust2', 'Asm2', 'R2', 'J200', 20, 2, ''),
    ]
    conn.executemany(
        "INSERT INTO fi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)",
        data,
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['user'] = 'tester'
        yield client


def test_final_inspect_report_data_daily(client):
    resp = client.get('/final-inspect/report-data?freq=daily')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['operators'][0]['operator'] == 'Alice'
    assert data['operators'][0]['inspected'] == 15
    assert data['shift_totals'][0]['shift'] == '1st'
    assert data['shift_totals'][0]['inspected'] == 15
