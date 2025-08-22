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
        "INSERT INTO users (username, password, analysis, reports) VALUES (?,?,1,1)",
        ('tester', 'pw')
    )
    conn.execute(
        "INSERT INTO moat (model_name, total_boards, total_parts_per_board, total_parts, ng_parts, ng_ppm, falsecall_parts, falsecall_ppm, upload_time, report_date) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ('MODEL1', 1, 1, 1, 0, 0.0, 0, 0.0, '2025-01-01T00:00:00', '2023-01-01')
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['user'] = 'tester'
        yield client


@pytest.mark.parametrize("freq,expected", [
    ("daily", "2023-01-01"),
    ("weekly", "2023-00"),
    ("monthly", "2023-01"),
    ("yearly", "2023"),
])
def test_analysis_report_data_uses_report_date(client, freq, expected):
    resp = client.get(f'/analysis/report-data?freq={freq}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['labels'] == [expected]
