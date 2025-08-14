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
        ('tester', 'pw')
    )
    conn.execute(
        "INSERT INTO moat (model_name, total_boards, total_parts_per_board, total_parts, ng_parts, ng_ppm, falsecall_parts, falsecall_ppm, upload_time) VALUES (?,?,?,?,?,?,?,?,?)",
        ('MODEL1', 1, 1, 1, 0, 0.0, 0, 0.0, '2023-01-01T00:00:00')
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['user'] = 'tester'
        yield client


def test_moat_sql_select(client):
    resp = client.post('/moat/sql', json={'query': 'SELECT model_name FROM moat'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['rows'][0]['model_name'] == 'MODEL1'


def test_moat_sql_reject_nonselect(client):
    resp = client.post('/moat/sql', json={'query': 'DELETE FROM moat'})
    assert resp.status_code == 400


def test_moat_sql_reject_other_tables(client):
    resp = client.post('/moat/sql', json={'query': 'SELECT * FROM users'})
    assert resp.status_code == 400
