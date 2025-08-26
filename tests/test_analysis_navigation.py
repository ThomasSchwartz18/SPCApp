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
        ('analyst', 'pw'),
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        yield client


def test_analysis_navigation_options(client):
    with client.session_transaction() as sess:
        sess['user'] = 'analyst'
    resp = client.get('/analysis')
    assert resp.status_code == 200
    assert b'View PPM Reports' in resp.data
    assert b'Compare AOI vs Final Inspect' in resp.data
    assert b'AOI Operator Grades' not in resp.data
