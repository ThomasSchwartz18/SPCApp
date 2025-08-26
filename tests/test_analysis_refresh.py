import os
import re
import pandas as pd
import pytest

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
    conn.commit()
    conn.close()
    # Default to a non-existent directory so startup import does nothing
    app.config['PUBLIC_PPM_DIR'] = str(tmp_path / 'nope')
    with app.test_client() as client:
        with client.session_transaction() as sess:
            sess['user'] = 'tester'
        yield client


def _get_token(client):
    resp = client.get('/analysis?view=moat')
    html = resp.get_data(as_text=True)
    return re.search(r'name="csrf_token" value="([^"]+)"', html).group(1)


def _create_report(dirpath):
    df = pd.DataFrame({
        'model_name': ['M1'],
        'total_boards': [1],
        'total_parts_per_board': [1],
        'total_parts': [1],
        'ng_parts': [0],
        'ng_ppm': [0.0],
        'falsecall_parts': [0],
        'falsecall_ppm': [0.0],
    })
    dirpath.mkdir(parents=True, exist_ok=True)
    file_path = dirpath / 'report.xlsx'
    df.to_excel(file_path, index=False, startrow=5, startcol=1)


def test_refresh_imports_new_reports(client, tmp_path):
    token = _get_token(client)
    root = tmp_path / 'ppm'
    _create_report(root / 'Line0' / '20230101')
    app.config['PUBLIC_PPM_DIR'] = str(root)
    resp = client.post('/analysis/refresh', headers={'X-CSRFToken': token})
    data = resp.get_json()
    assert data['message'].startswith('Imported')
    conn = get_db()
    count = conn.execute('SELECT COUNT(*) FROM moat').fetchone()[0]
    conn.close()
    assert count == 1


def test_refresh_no_files(client, tmp_path):
    root = tmp_path / 'ppm'
    (root / 'Line0' / '20230101').mkdir(parents=True)
    app.config['PUBLIC_PPM_DIR'] = str(root)
    token = _get_token(client)
    resp = client.post('/analysis/refresh', headers={'X-CSRFToken': token})
    data = resp.get_json()
    assert data['message'] == 'No new PPM reports found.'


def test_refresh_permission_error(client, tmp_path, monkeypatch):
    root = tmp_path / 'ppm'
    root.mkdir()
    app.config['PUBLIC_PPM_DIR'] = str(root)
    token = _get_token(client)

    def fail_listdir(path):
        raise PermissionError('denied')

    monkeypatch.setattr('run.os.listdir', fail_listdir)
    resp = client.post('/analysis/refresh', headers={'X-CSRFToken': token})
    data = resp.get_json()
    assert 'Permission error' in data['message']
