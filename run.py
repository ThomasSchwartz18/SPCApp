from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    jsonify,
    send_from_directory,
    session,
    flash,
)
from functools import wraps
import os
import sqlite3
import pandas as pd
from datetime import datetime, timedelta
import re
from sap_client import create_sap_service

def parse_aoi_rows(path: str):
    """Return rows from an AOI Excel file without headers."""
    ext = os.path.splitext(path)[1].lower()
    engine = 'xlrd' if ext == '.xls' else 'openpyxl'
    df = pd.read_excel(
        path,
        engine=engine,
        header=None,
        usecols='A:F',
        names=[
            'operator',
            'customer',
            'assembly',
            'qty_inspected',
            'qty_rejected',
            'additional_info',
        ],
    ).dropna(how='all')
    return df.to_dict(orient='records')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.secret_key = os.environ.get('SECRET_KEY', 'spc_secret')
DATABASE = 'spcapp.db'
USE_SAP = os.environ.get('USE_SAP', 'false').lower() == 'true'
sap_service = create_sap_service(use_real=USE_SAP)

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# --- Database helpers ---
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS moat (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT,
            total_boards INTEGER,
            total_parts_per_board INTEGER,
            total_parts INTEGER,
            ng_parts INTEGER,
            ng_ppm REAL,
            falsecall_parts INTEGER,
            falsecall_ppm REAL,
            upload_time TEXT,
            filename TEXT
        )
    ''')

    # Older database versions may lack the `filename` column. Ensure it exists so
    # uploaded file names can be tracked for later management/deletion without
    # storing them directly in the MOAT view.
    existing_cols = [r['name'] for r in conn.execute("PRAGMA table_info(moat)").fetchall()]
    if 'filename' not in existing_cols:
        conn.execute('ALTER TABLE moat ADD COLUMN filename TEXT')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS verified_markings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            part_number TEXT,
            mfg_number1 TEXT,
            mfg_number2 TEXT,
            manufacturer TEXT,
            verified_markings TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS aoi_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_date TEXT NOT NULL,
            shift TEXT,
            operator TEXT,
            customer TEXT,
            assembly TEXT,
            qty_inspected INTEGER,
            qty_rejected INTEGER,
            additional_info TEXT
        )
    ''')
    # Users with per-feature permissions. The ADMIN account is created by
    # default along with a basic USER account. Additional users can be managed
    # from the settings page.
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            part_markings INTEGER DEFAULT 0,
            aoi INTEGER DEFAULT 0,
            analysis INTEGER DEFAULT 0,
            dashboard INTEGER DEFAULT 0,
            c_suite INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0
        )
    ''')

    # Older database versions may lack the `c_suite` column. Ensure it exists so
    # privileged users beyond the hard-coded ADMIN account can be granted the
    # same access rights.
    existing_cols = [r['name'] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if 'c_suite' not in existing_cols:
        conn.execute('ALTER TABLE users ADD COLUMN c_suite INTEGER DEFAULT 0')

    conn.execute(
        'INSERT OR IGNORE INTO users (username, password, part_markings, aoi, analysis, dashboard, c_suite, is_admin) VALUES (?,?,?,?,?,?,?,?)',
        ('ADMIN', 'MasterAdmin', 1, 1, 1, 1, 1, 1),
    )
    conn.execute(
        'INSERT OR IGNORE INTO users (username, password, part_markings, aoi, analysis, dashboard, c_suite, is_admin) VALUES (?,?,?,?,?,?,?,?)',
        ('USER', 'fuji', 1, 0, 0, 0, 0, 0),
    )
    # Ensure existing ADMIN row gains C-suite privileges if it pre-existed the
    # column addition.
    conn.execute("UPDATE users SET c_suite=1 WHERE username='ADMIN'")
    conn.commit()
    conn.close()

# Initialize database
init_db()

# --- Auth helpers ---
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def has_permission(feature: str) -> bool:
    user = session.get('user')
    if not user:
        return False
    conn = get_db()
    try:
        row = conn.execute(
            f'SELECT is_admin, c_suite, {feature} as allowed FROM users WHERE username = ?',
            (user,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return False
    if row['is_admin'] or row['c_suite']:
        return True
    return bool(row['allowed'])


@app.context_processor
def inject_globals():
    user = session.get('user')
    perms = {}
    is_admin = False
    if user:
        conn = get_db()
        row = conn.execute(
            'SELECT part_markings, aoi, analysis, dashboard, is_admin, c_suite FROM users WHERE username = ?',
            (user,),
        ).fetchone()
        conn.close()
        if row:
            is_admin = bool(row['is_admin'] or row['c_suite'])
            if is_admin:
                perms = {
                    'part_markings': True,
                    'aoi': True,
                    'analysis': True,
                    'dashboard': True,
                }
            else:
                perms = {
                    'part_markings': bool(row['part_markings']),
                    'aoi': bool(row['aoi']),
                    'analysis': bool(row['analysis']),
                    'dashboard': bool(row['dashboard']),
                }
    return dict(current_user=user, permissions=perms, is_admin=is_admin)

# --- Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    conn = get_db()
    users = conn.execute('SELECT username, password FROM users').fetchall()
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password', '')
        row = next((u for u in users if u['username'] == username), None)
        if row and row['password'] == password:
            session['user'] = username
            conn.close()
            return redirect(url_for('home'))
        error = 'Invalid credentials'
    conn.close()
    return render_template('login.html', users=[u['username'] for u in users], error=error)


@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))


@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    conn = get_db()
    user = session.get('user')
    row = conn.execute(
        'SELECT is_admin, c_suite FROM users WHERE username=?',
        (user,),
    ).fetchone()
    if not row or not (row['is_admin'] or row['c_suite']):
        conn.close()
        return redirect(url_for('home'))

    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'add':
            username = request.form.get('username')
            password = request.form.get('password')
            privs = request.form.getlist('privileges')
            conn.execute(
                'INSERT OR IGNORE INTO users (username, password, part_markings, aoi, analysis, dashboard, c_suite, is_admin) VALUES (?,?,?,?,?,?,?,0)',
                (
                    username,
                    password,
                    1 if 'part_markings' in privs else 0,
                    1 if 'aoi' in privs else 0,
                    1 if 'analysis' in privs else 0,
                    1 if 'dashboard' in privs else 0,
                    1 if 'c_suite' in privs else 0,
                ),
            )
            conn.commit()
        elif action == 'update':
            uid = request.form.get('user_id')
            privs = request.form.getlist('privileges')
            conn.execute(
                'UPDATE users SET part_markings=?, aoi=?, analysis=?, dashboard=?, c_suite=? WHERE id=?',
                (
                    1 if 'part_markings' in privs else 0,
                    1 if 'aoi' in privs else 0,
                    1 if 'analysis' in privs else 0,
                    1 if 'dashboard' in privs else 0,
                    1 if 'c_suite' in privs else 0,
                    uid,
                ),
            )
            conn.commit()
        elif action == 'delete':
            uid = request.form.get('user_id')
            conn.execute('DELETE FROM users WHERE id=?', (uid,))
            conn.commit()
    users = conn.execute(
        'SELECT id, username, part_markings, aoi, analysis, dashboard, c_suite FROM users WHERE username != ?',
        ('ADMIN',),
    ).fetchall()
    conn.close()
    return render_template('settings.html', users=users)


@app.route('/')
@login_required
def home():
    # Example placeholder data; replace with SAP integration later
    today = datetime.today()
    example_data = [
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 5,
            'locations': [('Hand Assembly', 295), ('Rework', 5)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 10,
            'locations': [('Depanel', 75)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 4,
            'locations': [('Final Inspect', 1500)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 2,
            'locations': [('Hand Assembly', 25)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': -2,
            'locations': [('AOI', 230), ('Rework', 20)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 13,
            'locations': [('SMT', 1000)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 9,
            'locations': [('AOI', 100), ('Rework', 75)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 1,
            'locations': [('ERSA', 450), ('AOI', 478), ('Rework', 72)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': 0,
            'locations': [('Hand Assembly', 100)],
        },
        {
            'job': '[Assembly #] (DRAFT)',
            'due_in_days': -1,
            'locations': [('Hand Assembly', 100)],
        },
    ]

    # Sort by days until due so earliest jobs appear first
    example_data.sort(key=lambda x: x['due_in_days'])

    jobs = []
    for item in example_data:
        due_date = today + timedelta(days=item['due_in_days'])

        days = item['due_in_days']
        if days <= 2:
            highlight = 'danger'
        elif days <= 6:
            highlight = 'warning'
        else:
            highlight = ''

        jobs.append({
            'job': item['job'],
            'due_date': due_date.strftime('%Y-%m-%d'),
            'due_in': f"{days} days",
            'locations': item['locations'],
            'total': sum(count for _, count in item['locations']),
            'highlight': highlight,
            'due_in_days': days,
        })
    return render_template('home.html', sample_jobs=jobs)


@app.route('/docs')
@login_required
def docs():
    return render_template('docs.html')

@app.route('/part-markings', methods=['GET', 'POST'])
@login_required
def part_markings():
    conn = get_db()
    if request.method == 'POST':
        if not has_permission('part_markings'):
            conn.close()
            return redirect(url_for('part_markings'))
        # Handle spreadsheet upload
        if 'excel_file' in request.files and request.files['excel_file'].filename:
            file = request.files['excel_file']
            filename = file.filename
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)

            ext = os.path.splitext(save_path)[1].lower()
            engine = 'xlrd' if ext == '.xls' else 'openpyxl'

            df = pd.read_excel(
                save_path,
                engine=engine,
                header=None,
                usecols='A:E',
                names=[
                    'verified_markings',
                    'manufacturer',
                    'mfg_number2',
                    'mfg_number1',
                    'part_number',
                ],
            ).dropna(how='all')

            conn.executemany(
                'INSERT INTO verified_markings (part_number, mfg_number1, mfg_number2, manufacturer, verified_markings) VALUES (?,?,?,?,?)',
                df[
                    [
                        'part_number',
                        'mfg_number1',
                        'mfg_number2',
                        'manufacturer',
                        'verified_markings',
                    ]
                ].values.tolist(),
            )
            conn.commit()
            conn.close()
            return redirect(url_for('part_markings'))

        # Handle single record submission
        part_number = request.form.get('part_number')
        mfg1 = request.form.get('mfg_number1')
        mfg2 = request.form.get('mfg_number2')
        manufacturer = request.form.get('manufacturer')
        markings = request.form.get('verified_markings')
        conn.execute(
            'INSERT INTO verified_markings (part_number, mfg_number1, mfg_number2, manufacturer, verified_markings) VALUES (?,?,?,?,?)',
            (part_number, mfg1, mfg2, manufacturer, markings),
        )
        conn.commit()
    rows = conn.execute('SELECT * FROM verified_markings ORDER BY id').fetchall()
    conn.close()
    return render_template('part_markings.html', markings=rows)


@app.route('/part-markings/<int:row_id>', methods=['PUT'])
@login_required
def update_part_marking(row_id):
    if not has_permission('part_markings'):
        return jsonify(error='Forbidden'), 403
    data = request.json or {}
    field = data.get('field')
    value = data.get('value', '')
    allowed = {
        'part_number',
        'mfg_number1',
        'mfg_number2',
        'manufacturer',
        'verified_markings',
    }
    if field not in allowed:
        return jsonify(error='Invalid field'), 400
    try:
        conn = get_db()
        conn.execute(
            f'UPDATE verified_markings SET {field} = ? WHERE id = ?',
            (value, row_id),
        )
        conn.commit()
        conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.route('/part-markings/<int:row_id>', methods=['DELETE'])
@login_required
def delete_part_marking(row_id):
    if not has_permission('part_markings'):
        return jsonify(error='Forbidden'), 403
    try:
        conn = get_db()
        conn.execute('DELETE FROM verified_markings WHERE id = ?', (row_id,))
        conn.commit()
        conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/aoi', methods=['GET', 'POST'])
@login_required
def aoi_report():
    conn = get_db()
    if request.method == 'POST':
        if not has_permission('aoi'):
            conn.close()
            return redirect(url_for('aoi_report'))

        report_date = request.form.get('report_date')
        shift = request.form.get('shift')
        if 'excel_file' in request.files and request.files['excel_file'].filename:
            file = request.files['excel_file']
            filename = file.filename
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)
            rows = parse_aoi_rows(save_path)
            records = [
                (
                    report_date,
                    shift,
                    r['operator'],
                    r['customer'],
                    r['assembly'],
                    int(r['qty_inspected'] or 0),
                    int(r['qty_rejected'] or 0),
                    r.get('additional_info', ''),
                )
                for r in rows
            ]
            if records:
                conn.executemany(
                    'INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?)',
                    records,
                )
                conn.commit()
            conn.close()
            return redirect(url_for('aoi_report'))

        # single record submission
        operator = request.form.get('operator')
        customer = request.form.get('customer')
        assembly = request.form.get('assembly')
        inspected = request.form.get('qty_inspected') or 0
        rejected = request.form.get('qty_rejected') or 0
        additional = request.form.get('additional_info') or ''
        conn.execute(
            'INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?)',
            (report_date, shift, operator, customer, assembly, inspected, rejected, additional),
        )
        conn.commit()
        conn.close()
        return redirect(url_for('aoi_report'))

    # GET: fetch rows and analytics
    start = request.args.get('start')
    end = request.args.get('end')
    customer = request.args.get('customer')
    shift_filter = request.args.get('shift')
    operator_filter = request.args.get('operator')
    assembly_filter = request.args.get('assembly')

    where = 'WHERE 1=1'
    params = []
    if start:
        where += ' AND report_date >= ?'
        params.append(start)
    if end:
        where += ' AND report_date <= ?'
        params.append(end)
    if customer:
        where += ' AND customer = ?'
        params.append(customer)
    if shift_filter:
        where += ' AND shift = ?'
        params.append(shift_filter)
    if operator_filter:
        where += ' AND operator = ?'
        params.append(operator_filter)
    if assembly_filter:
        where += ' AND assembly = ?'
        params.append(assembly_filter)

    rows = conn.execute(
        f'SELECT * FROM aoi_reports {where} ORDER BY report_date DESC, id DESC',
        params,
    ).fetchall()

    op_rows = conn.execute(
        f'SELECT operator, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        f'FROM aoi_reports {where} GROUP BY operator ORDER BY inspected DESC',
        params,
    ).fetchall()
    asm_rows = conn.execute(
        f'SELECT assembly, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        f'FROM aoi_reports {where} GROUP BY assembly ORDER BY inspected DESC',
        params,
    ).fetchall()
    shift_rows = conn.execute(
        f'SELECT report_date, shift, SUM(qty_inspected) AS inspected, '
        f'SUM(qty_rejected) AS rejected FROM aoi_reports {where} '
        f'GROUP BY report_date, shift ORDER BY report_date, shift',
        params,
    ).fetchall()
    cust_rows = conn.execute(
        f'SELECT customer, SUM(qty_rejected)*1.0/SUM(qty_inspected) AS rate '
        f'FROM aoi_reports {where} GROUP BY customer ORDER BY customer',
        params,
    ).fetchall()
    yield_rows = conn.execute(
        f'SELECT report_date, 1 - SUM(qty_rejected)*1.0/SUM(qty_inspected) AS yield '
        f'FROM aoi_reports {where} GROUP BY report_date ORDER BY report_date',
        params,
    ).fetchall()
    customer_opts = [r['customer'] for r in conn.execute('SELECT DISTINCT customer FROM aoi_reports ORDER BY customer').fetchall()]
    shift_opts = [r['shift'] for r in conn.execute('SELECT DISTINCT shift FROM aoi_reports ORDER BY shift').fetchall()]
    operator_opts = [r['operator'] for r in conn.execute('SELECT DISTINCT operator FROM aoi_reports ORDER BY operator').fetchall()]
    assembly_opts = [r['assembly'] for r in conn.execute('SELECT DISTINCT assembly FROM aoi_reports ORDER BY assembly').fetchall()]
    conn.close()

    operators = []
    for r in op_rows:
        inspected = r['inspected'] or 0
        rejected = r['rejected'] or 0
        yield_rate = 1 - (rejected / inspected) if inspected else 0
        operators.append({
            'operator': r['operator'],
            'inspected': inspected,
            'rejected': rejected,
            'yield': yield_rate,
        })

    assemblies = []
    for r in asm_rows:
        inspected = r['inspected'] or 0
        rejected = r['rejected'] or 0
        yield_rate = 1 - (rejected / inspected) if inspected else 0
        assemblies.append({
            'assembly': r['assembly'],
            'inspected': inspected,
            'rejected': rejected,
            'yield': yield_rate,
        })

    shift_totals = [
        {
            'report_date': r['report_date'],
            'shift': r['shift'],
            'inspected': r['inspected'] or 0,
            'rejected': r['rejected'] or 0,
        }
        for r in shift_rows
    ]

    customer_rates = [
        {
            'customer': r['customer'],
            'rate': r['rate'] or 0,
        }
        for r in cust_rows
    ]

    yield_series = [
        {
            'report_date': r['report_date'],
            'yield': r['yield'] or 0,
        }
        for r in yield_rows
    ]

    return render_template(
        'aoi.html',
        records=rows,
        operators=operators,
        assemblies=assemblies,
        shift_totals=shift_totals,
        customer_rates=customer_rates,
        yield_series=yield_series,
        customers=customer_opts,
        shifts=shift_opts,
        operator_opts=operator_opts,
        assembly_opts=assembly_opts,
        start=start,
        end=end,
        selected_customer=customer,
        selected_shift=shift_filter,
        selected_operator=operator_filter,
        selected_assembly=assembly_filter,
    )


@app.route('/aoi/report-data')
@login_required
def aoi_report_data():
    freq = request.args.get('freq', 'daily').lower()
    days_map = {'daily': 1, 'weekly': 7, 'monthly': 30, 'yearly': 365}
    conn = get_db()
    end_row = conn.execute('SELECT MAX(report_date) AS max_date FROM aoi_reports').fetchone()
    if not end_row or not end_row['max_date']:
        conn.close()
        return jsonify(operators=[], shift_totals=[], customer_rates=[], yield_series=[], assemblies=[])
    end_date = datetime.strptime(end_row['max_date'], '%Y-%m-%d').date()
    delta = days_map.get(freq, 1)
    start_date = end_date - timedelta(days=delta - 1)
    params = [start_date.isoformat(), end_date.isoformat()]

    op_rows = conn.execute(
        'SELECT operator, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        'FROM aoi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY operator ORDER BY inspected DESC',
        params,
    ).fetchall()
    asm_rows = conn.execute(
        'SELECT assembly, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        'FROM aoi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY assembly ORDER BY inspected DESC',
        params,
    ).fetchall()
    shift_rows = conn.execute(
        'SELECT shift, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        'FROM aoi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY shift ORDER BY shift',
        params,
    ).fetchall()
    cust_rows = conn.execute(
        'SELECT customer, SUM(qty_rejected)*1.0/SUM(qty_inspected) AS rate '
        'FROM aoi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY customer ORDER BY customer',
        params,
    ).fetchall()
    yield_rows = conn.execute(
        'SELECT report_date, 1 - SUM(qty_rejected)*1.0/SUM(qty_inspected) AS yield '
        'FROM aoi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY report_date ORDER BY report_date',
        params,
    ).fetchall()
    conn.close()

    operators = [
        {
            'operator': r['operator'],
            'inspected': r['inspected'] or 0,
            'rejected': r['rejected'] or 0,
        }
        for r in op_rows
    ]
    assemblies = [
        {
            'assembly': r['assembly'],
            'inspected': r['inspected'] or 0,
            'rejected': r['rejected'] or 0,
            'yield': 1 - (r['rejected'] * 1.0 / r['inspected']) if r['inspected'] else 0,
        }
        for r in asm_rows
    ]
    shift_totals = [
        {
            'shift': r['shift'],
            'inspected': r['inspected'] or 0,
            'rejected': r['rejected'] or 0,
        }
        for r in shift_rows
    ]
    customer_rates = [
        {
            'customer': r['customer'],
            'rate': r['rate'] or 0,
        }
        for r in cust_rows
    ]
    yield_series = [
        {
            'report_date': r['report_date'],
            'yield': r['yield'] or 0,
        }
        for r in yield_rows
    ]

    return jsonify(
        operators=operators,
        shift_totals=shift_totals,
        customer_rates=customer_rates,
        yield_series=yield_series,
        assemblies=assemblies,
    )


@app.route('/aoi/sql', methods=['POST'])
@login_required
def aoi_sql():
    if not has_permission('aoi'):
        return jsonify(error='Forbidden'), 403
    data = request.get_json() or {}
    query = data.get('query', '')
    params = data.get('params', [])
    if not isinstance(params, list):
        return jsonify(error='Invalid parameters'), 400
    statements = [s.strip() for s in query.split(';') if s.strip()]
    if len(statements) != 1 or not statements[0].lower().startswith('select'):
        return jsonify(error='Only SELECT statements allowed'), 400
    lowered = statements[0].lower()
    allowed_tables = {'aoi_reports'}
    pattern = re.compile(r'from\s+([a-zA-Z0-9_]+)|join\s+([a-zA-Z0-9_]+)')
    for m in pattern.finditer(lowered):
        tbl = m.group(1) or m.group(2)
        if tbl not in allowed_tables:
            return jsonify(error='Table not allowed'), 400
    conn = get_db()
    try:
        cur = conn.execute(statements[0], params)
        rows = [dict(r) for r in cur.fetchall()]
    except Exception as e:
        conn.close()
        return jsonify(error=str(e)), 400
    conn.close()
    return jsonify(rows=rows)


@app.route('/aoi/<int:row_id>', methods=['DELETE'])
@login_required
def delete_aoi_record(row_id):
    if not has_permission('aoi'):
        return jsonify(error='Forbidden'), 403
    try:
        conn = get_db()
        conn.execute('DELETE FROM aoi_reports WHERE id = ?', (row_id,))
        conn.commit()
        conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/analysis', methods=['GET', 'POST'])
@login_required
def analysis():
    show = False
    # Handle upload via POST
    if request.method == 'POST' and 'ppm_report' in request.files:
        if not has_permission('analysis'):
            return redirect(url_for('analysis'))
        file = request.files['ppm_report']
        if file:
            filename = file.filename
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)

            ext = os.path.splitext(save_path)[1].lower()
            engine = 'xlrd' if ext == '.xls' else 'openpyxl'

            df = pd.read_excel(save_path, engine=engine, header=5, usecols='B:I')
            df = df[df.iloc[:, 0] != 'Total']
            df.columns = [
                'model_name','total_boards','total_parts_per_board','total_parts',
                'ng_parts','ng_ppm','falsecall_parts','falsecall_ppm'
            ]
            df['upload_time'] = datetime.utcnow().isoformat()
            df['filename'] = filename

            conn = get_db()
            df.to_sql('moat', conn, if_exists='append', index=False)
            conn.close()

        return redirect(url_for('analysis', view='moat'))

    # GET: determine if MOAT view
    args = request.args
    if args.get('view') == 'moat':
        show = True
        conn = get_db()
        rows = conn.execute('SELECT * FROM moat ORDER BY id').fetchall()
        conn.close()

        total_rows = len(rows)
        if total_rows:
            times = [datetime.fromisoformat(r['upload_time']) for r in rows]
            earliest = min(times).date().isoformat()
            latest = max(times).date().isoformat()
        else:
            earliest = latest = ''
    else:
        rows = []
        total_rows = 0
        earliest = latest = ''
    conn = get_db()
    model_rows = conn.execute('SELECT DISTINCT model_name FROM moat ORDER BY model_name').fetchall()
    conn.close()
    model_names = [r['model_name'] for r in model_rows]

    return render_template(
        'analysis.html',
        moat=rows,
        show_moat=show,
        total_rows=total_rows,
        earliest=earliest,
        latest=latest,
        model_names=model_names
    )

@app.route('/analysis/chart-data')
@login_required
def chart_data():
    start = request.args.get('start')
    end = request.args.get('end')
    threshold = request.args.get('threshold', type=int, default=0)
    metric = request.args.get('metric', 'fc')
    lines_param = request.args.get('lines', '')
    models_param = request.args.get('models', '')
    model_filter = request.args.get('model_filter', '').upper()
    column = 'falsecall_parts' if metric == 'fc' else 'ng_parts'
    conn = get_db()
    query = f'SELECT model_name, SUM({column})*1.0/SUM(total_boards) AS rate, SUM(total_boards) AS boards FROM moat WHERE 1=1'
    params = []
    if start:
        query += ' AND upload_time >= ?'
        params.append(f'{start}T00:00:00')
    if end:
        query += ' AND upload_time <= ?'
        params.append(f'{end}T23:59:59')
    if models_param:
        models = [m.strip() for m in models_param.split(',') if m.strip()]
        if models:
            placeholders = ','.join('?' for _ in models)
            query += f' AND model_name IN ({placeholders})'
            params.extend(models)
    if lines_param:
        lines = [l for l in lines_param.split(',') if l]
        if lines:
            clause = ' OR '.join('filename LIKE ?' for _ in lines)
            query += f' AND ({clause})'
            params.extend([f'%{line}%' for line in lines])
    if model_filter in ('SMT', 'TH'):
        query += ' AND UPPER(model_name) LIKE ?'
        params.append(f'%{model_filter}%')
    query += ' GROUP BY model_name HAVING SUM(total_boards) >= ?'
    params.append(threshold)
    data = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([{'model': r['model_name'], 'rate': r['rate'], 'boards': r['boards']} for r in data])

@app.route('/analysis/report-data')
@login_required
def analysis_report_data():
    if not has_permission('analysis'):
        return jsonify(error='Forbidden'), 403
    freq = request.args.get('freq', 'daily').lower()
    if freq == 'daily':
        group = '%Y-%m-%d'
    elif freq == 'weekly':
        group = '%Y-%W'
    elif freq == 'monthly':
        group = '%Y-%m'
    elif freq == 'yearly':
        group = '%Y'
    else:
        return jsonify(error='Invalid frequency'), 400
    conn = get_db()
    rows = conn.execute(
        f"""
        SELECT strftime('{group}', upload_time) AS period,
               SUM(total_boards) AS boards,
               SUM(falsecall_parts)*1000000.0/SUM(total_parts) AS fc_ppm,
               SUM(ng_parts)*1000000.0/SUM(total_parts) AS ng_ppm
        FROM moat
        GROUP BY period
        ORDER BY period
        """
    ).fetchall()
    conn.close()
    return jsonify({
        'labels': [r['period'] for r in rows],
        'falsecall_ppm': [r['fc_ppm'] for r in rows],
        'ng_ppm': [r['ng_ppm'] for r in rows],
        'table': [
            {
                'period': r['period'],
                'boards': r['boards'],
                'falsecall_ppm': r['fc_ppm'],
                'ng_ppm': r['ng_ppm'],
            }
            for r in rows
        ]
    })

@app.route('/uploads')
@login_required
def list_uploads():
    if not has_permission('analysis'):
        return jsonify(files=[])
    try:
        conn = get_db()
        files = conn.execute('SELECT DISTINCT filename FROM moat').fetchall()
        conn.close()
        return jsonify(files=[f['filename'] for f in files])
    except Exception as e:
        app.logger.error('Error in list_uploads', exc_info=e)
        return jsonify(files=[], error=str(e)), 500

@app.route('/uploads/delete', methods=['POST'])
@login_required
def delete_upload():
    if not has_permission('analysis'):
        return jsonify(error='Forbidden'), 403
    data = request.json or {}
    filename = data.get('filename')
    if not filename:
        return jsonify(error='Filename required'), 400
    conn = get_db()
    conn.execute('DELETE FROM moat WHERE filename = ?', (filename,))
    conn.commit()
    conn.close()
    path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(path):
        os.remove(path)
    return jsonify(success=True)


@app.route('/moat/sql', methods=['POST'])
@login_required
def moat_sql():
    if not has_permission('analysis'):
        return jsonify(error='Forbidden'), 403
    data = request.get_json() or {}
    query = data.get('query', '')
    params = data.get('params', [])
    if not isinstance(params, list):
        return jsonify(error='Invalid parameters'), 400
    statements = [s.strip() for s in query.split(';') if s.strip()]
    if len(statements) != 1 or not statements[0].lower().startswith('select'):
        return jsonify(error='Only SELECT statements allowed'), 400
    lowered = statements[0].lower()
    allowed_tables = {'moat'}
    pattern = re.compile(r'from\s+([a-zA-Z0-9_]+)|join\s+([a-zA-Z0-9_]+)')
    for m in pattern.finditer(lowered):
        tbl = m.group(1) or m.group(2)
        if tbl not in allowed_tables:
            return jsonify(error='Table not allowed'), 400
    conn = get_db()
    try:
        cur = conn.execute(statements[0], params)
        rows = [dict(r) for r in cur.fetchall()]
    except Exception as e:
        conn.close()
        return jsonify(error=str(e)), 400
    conn.close()
    return jsonify(rows=rows)


@app.route('/sap/material/<material_id>')
@login_required
def sap_material(material_id):
    try:
        material = sap_service.get_material(material_id)
        return jsonify({'id': material.id, 'description': material.description})
    except KeyError:
        return jsonify(error='Not found'), 404
    except TimeoutError:
        return jsonify(error='SAP timeout'), 504


@app.route('/aoi/html/<path:filename>')
@login_required
def aoi_html(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

