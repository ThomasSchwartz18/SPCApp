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
        "INSERT INTO users (username, password, reports) VALUES (?,?,1)",
        ('reporter', 'pw'),
    )
    conn.commit()
    conn.close()
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['user'] = 'reporter'
        yield client


def test_save_and_load_report(client):
    resp = client.post('/reports/save', json={'name': 'Sample', 'content': '[]'})
    assert resp.status_code == 200
    report_id = resp.get_json()['id']

    list_resp = client.get('/reports/list')
    assert list_resp.status_code == 200
    reports = list_resp.get_json()
    assert any(r['id'] == report_id for r in reports)

    fetch_resp = client.get(f'/reports/{report_id}')
    assert fetch_resp.status_code == 200
    data = fetch_resp.get_json()
    assert data['content'] == '[]'
