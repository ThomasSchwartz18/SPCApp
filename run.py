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
from flask_wtf import CSRFProtect
from functools import wraps
import os
import sqlite3
import pandas as pd
from datetime import datetime, timedelta, date
import re
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from sap_client import create_sap_service

def parse_aoi_rows(path: str):
    """Return rows from an AOI Excel file without headers."""
    ext = os.path.splitext(path)[1].lower()
    engine = 'xlrd' if ext == '.xls' else 'openpyxl'
    df = pd.read_excel(
        path,
        engine=engine,
        header=None,
        usecols='A:H',
        names=[
            'operator',
            'customer',
            'assembly',
            'rev',
            'job_number',
            'qty_inspected',
            'qty_rejected',
            'additional_info',
        ],
    ).dropna(how='all')
    return df.to_dict(orient='records')

app = Flask(__name__)
csrf = CSRFProtect(app)
app.config['UPLOAD_FOLDER'] = 'uploads'
# Only allow known-safe spreadsheet extensions
ALLOWED_EXTENSIONS = {'.xls', '.xlsx'}
secret_key = os.environ.get('SECRET_KEY')
if not secret_key:
    raise RuntimeError("SECRET_KEY environment variable is required")
app.secret_key = secret_key
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
            filename TEXT,
            report_date TEXT,
            line TEXT
        )
    ''')

    # Older database versions may lack the `filename` column. Ensure it exists so
    # uploaded file names can be tracked for later management/deletion without
    # storing them directly in the MOAT view.
    existing_cols = [r['name'] for r in conn.execute("PRAGMA table_info(moat)").fetchall()]
    if 'filename' not in existing_cols:
        conn.execute('ALTER TABLE moat ADD COLUMN filename TEXT')
    if 'report_date' not in existing_cols:
        conn.execute('ALTER TABLE moat ADD COLUMN report_date TEXT')
    if 'line' not in existing_cols:
        conn.execute('ALTER TABLE moat ADD COLUMN line TEXT')

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
        CREATE TABLE IF NOT EXISTS stencils (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stencil_number TEXT,
            part_number TEXT,
            ref TEXT,
            description TEXT,
            location_of_stencil TEXT
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
            rev TEXT,
            job_number TEXT,
            qty_inspected INTEGER,
            qty_rejected INTEGER,
            additional_info TEXT
        )
    ''')

    conn.execute('''
        CREATE TABLE IF NOT EXISTS fi_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_date TEXT NOT NULL,
            shift TEXT,
            operator TEXT,
            customer TEXT,
            assembly TEXT,
            rev TEXT,
            job_number TEXT,
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
            reports INTEGER DEFAULT 0,
            c_suite INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0
        )
    ''')

    # Older database versions may lack the `c_suite` or `reports` column.
    # Ensure they exist so privileged users beyond the hard-coded ADMIN account
    # can be granted the same access rights.
    existing_cols = [r['name'] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if 'c_suite' not in existing_cols:
        conn.execute('ALTER TABLE users ADD COLUMN c_suite INTEGER DEFAULT 0')
    if 'reports' not in existing_cols:
        conn.execute('ALTER TABLE users ADD COLUMN reports INTEGER DEFAULT 0')

    # Ensure new columns exist for older AOI report tables
    aoi_cols = [r['name'] for r in conn.execute("PRAGMA table_info(aoi_reports)").fetchall()]
    if 'rev' not in aoi_cols:
        conn.execute('ALTER TABLE aoi_reports ADD COLUMN rev TEXT')
    if 'job_number' not in aoi_cols:
        conn.execute('ALTER TABLE aoi_reports ADD COLUMN job_number TEXT')

    fi_cols = [r['name'] for r in conn.execute("PRAGMA table_info(fi_reports)").fetchall()]
    if 'rev' not in fi_cols:
        conn.execute('ALTER TABLE fi_reports ADD COLUMN rev TEXT')
    if 'job_number' not in fi_cols:
        conn.execute('ALTER TABLE fi_reports ADD COLUMN job_number TEXT')

    conn.execute(
        'INSERT OR IGNORE INTO users (username, password, part_markings, aoi, analysis, dashboard, reports, c_suite, is_admin) VALUES (?,?,?,?,?,?,?,?,?)',
        (
            'ADMIN',
            generate_password_hash('MasterAdmin'),
            1,
            1,
            1,
            1,
            1,
            1,
            1,
        ),
    )
    conn.execute(
        'INSERT OR IGNORE INTO users (username, password, part_markings, aoi, analysis, dashboard, reports, c_suite, is_admin) VALUES (?,?,?,?,?,?,?,?,?)',
        (
            'USER',
            generate_password_hash('fuji'),
            1,
            0,
            0,
            0,
            0,
            0,
            0,
        ),
    )
    # Ensure existing ADMIN row gains C-suite privileges and report access if
    # they pre-existed the column addition.
    conn.execute("UPDATE users SET c_suite=1, reports=1 WHERE username='ADMIN'")
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


def is_admin_user() -> bool:
    user = session.get('user')
    if not user:
        return False
    conn = get_db()
    try:
        row = conn.execute(
            'SELECT is_admin, c_suite FROM users WHERE username = ?',
            (user,),
        ).fetchone()
    finally:
        conn.close()
    return bool(row and (row['is_admin'] or row['c_suite']))


@app.context_processor
def inject_globals():
    user = session.get('user')
    perms = {}
    is_admin = False
    if user:
        conn = get_db()
        row = conn.execute(
            'SELECT part_markings, aoi, analysis, dashboard, reports, is_admin, c_suite FROM users WHERE username = ?',
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
                    'reports': True,
                }
            else:
                perms = {
                    'part_markings': bool(row['part_markings']),
                    'aoi': bool(row['aoi']),
                    'analysis': bool(row['analysis']),
                    'dashboard': bool(row['dashboard']),
                    'reports': bool(row['reports']),
                }
    return dict(current_user=user, permissions=perms, is_admin=is_admin)

# --- Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    conn = get_db()
    users = conn.execute('SELECT username FROM users').fetchall()
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password', '')
        row = conn.execute('SELECT password FROM users WHERE username = ?', (username,)).fetchone()
        if row and (check_password_hash(row['password'], password) or row['password'] == password):
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
                'INSERT OR IGNORE INTO users (username, password, part_markings, aoi, analysis, dashboard, reports, c_suite, is_admin) VALUES (?,?,?,?,?,?,?,?,0)',
                (
                    username,
                    generate_password_hash(password),
                    1 if 'part_markings' in privs else 0,
                    1 if 'aoi' in privs else 0,
                    1 if 'analysis' in privs else 0,
                    1 if 'dashboard' in privs else 0,
                    1 if 'reports' in privs else 0,
                    1 if 'c_suite' in privs else 0,
                ),
            )
            conn.commit()
        elif action == 'update':
            uid = request.form.get('user_id')
            privs = request.form.getlist('privileges')
            conn.execute(
                'UPDATE users SET part_markings=?, aoi=?, analysis=?, dashboard=?, reports=?, c_suite=? WHERE id=?',
                (
                    1 if 'part_markings' in privs else 0,
                    1 if 'aoi' in privs else 0,
                    1 if 'analysis' in privs else 0,
                    1 if 'dashboard' in privs else 0,
                    1 if 'reports' in privs else 0,
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
        'SELECT id, username, part_markings, aoi, analysis, dashboard, reports, c_suite FROM users WHERE username != ?',
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
            filename = secure_filename(file.filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                flash('Invalid file type')
                conn.close()
                return redirect(url_for('part_markings'))
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)

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


@app.route('/rework', methods=['GET', 'POST'])
@login_required
def rework():
    conn = get_db()
    if request.method == 'POST':
        stencil_number = request.form.get('stencil_number')
        part_number = request.form.get('part_number')
        ref = request.form.get('ref')
        description = request.form.get('description')
        location = request.form.get('location_of_stencil')
        conn.execute(
            'INSERT INTO stencils (stencil_number, part_number, ref, description, location_of_stencil) VALUES (?,?,?,?,?)',
            (stencil_number, part_number, ref, description, location),
        )
        conn.commit()
    rows = conn.execute('SELECT * FROM stencils ORDER BY id').fetchall()
    conn.close()
    return render_template('rework.html', stencils=rows)


@app.route('/rework/<int:row_id>', methods=['PUT'])
@login_required
def update_stencil(row_id):
    if not is_admin_user():
        return jsonify(error='Forbidden'), 403
    data = request.json or {}
    field = data.get('field')
    value = data.get('value', '')
    allowed = {
        'stencil_number',
        'part_number',
        'ref',
        'description',
        'location_of_stencil',
    }
    if field not in allowed:
        return jsonify(error='Invalid field'), 400
    conn = get_db()
    conn.execute(f'UPDATE stencils SET {field} = ? WHERE id = ?', (value, row_id))
    conn.commit()
    conn.close()
    return jsonify(success=True)


@app.route('/rework/<int:row_id>', methods=['DELETE'])
@login_required
def delete_stencil(row_id):
    if not is_admin_user():
        return jsonify(error='Forbidden'), 403
    conn = get_db()
    conn.execute('DELETE FROM stencils WHERE id = ?', (row_id,))
    conn.commit()
    conn.close()
    return jsonify(success=True)

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
            filename = secure_filename(file.filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                flash('Invalid file type')
                conn.close()
                return redirect(url_for('aoi_report'))
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
                    r.get('rev'),
                    r.get('job_number'),
                    int(r['qty_inspected'] or 0),
                    int(r['qty_rejected'] or 0),
                    r.get('additional_info', ''),
                )
                for r in rows
            ]
            if records:
                conn.executemany(
                    'INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    records,
                )
                conn.commit()
            conn.close()
            return redirect(url_for('aoi_report'))

        # single record submission
        operator = request.form.get('operator')
        customer = request.form.get('customer')
        assembly = request.form.get('assembly')
        rev = request.form.get('rev')
        job_number = request.form.get('job_number')
        inspected = request.form.get('qty_inspected') or 0
        rejected = request.form.get('qty_rejected') or 0
        additional = request.form.get('additional_info') or ''
        conn.execute(
            'INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)',
            (report_date, shift, operator, customer, assembly, rev, job_number, inspected, rejected, additional),
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
        report_base='aoi',
    )


@app.route('/aoi/report-data')
@login_required
def aoi_report_data():
    if not has_permission('aoi'):
        return jsonify(error='Forbidden'), 403
    freq = request.args.get('freq', 'daily').lower()
    start = request.args.get('start')
    end = request.args.get('end')
    group_map = {
        'daily': '%Y-%m-%d',
        'weekly': '%Y-%W',
        'monthly': '%Y-%m',
        'yearly': '%Y',
    }
    days_map = {
        'daily': 1,
        'weekly': 7,
        'monthly': 30,
        'yearly': 365,
    }
    group = group_map.get(freq)
    if not group:
        return jsonify(error='Invalid frequency'), 400

    conn = get_db()
    if start and end:
        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date()
            end_date = datetime.strptime(end, '%Y-%m-%d').date()
        except ValueError:
            conn.close()
            return jsonify(error='Invalid date format'), 400
    else:
        delta = days_map.get(freq)
        if not delta:
            conn.close()
            return jsonify(error='Invalid frequency'), 400
        end_row = conn.execute('SELECT MAX(report_date) AS max_date FROM aoi_reports').fetchone()
        if not end_row or not end_row['max_date']:
            conn.close()
            return jsonify(operators=[], shift_totals=[], customer_rates=[], yield_series=[], assemblies=[])
        end_date = datetime.strptime(end_row['max_date'], '%Y-%m-%d').date()
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
        f"SELECT strftime('{group}', report_date) AS period, "
        "1 - SUM(qty_rejected)*1.0/SUM(qty_inspected) AS yield "
        "FROM aoi_reports WHERE report_date BETWEEN ? AND ? "
        "GROUP BY period ORDER BY period",
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
            'period': r['period'],
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


@app.route('/aoi/<int:row_id>', methods=['PATCH'])
@login_required
def update_aoi_record(row_id):
    if not has_permission('aoi'):
        return jsonify(error='Forbidden'), 403
    data = request.get_json() or {}
    field = data.get('field')
    value = data.get('value', '')
    allowed_fields = {
        'report_date',
        'shift',
        'operator',
        'customer',
        'assembly',
        'rev',
        'job_number',
        'qty_inspected',
        'qty_rejected',
        'additional_info',
    }
    if field not in allowed_fields:
        return jsonify(error='Invalid field'), 400
    try:
        conn = get_db()
        conn.execute(f'UPDATE aoi_reports SET {field} = ? WHERE id = ?', (value, row_id))
        conn.commit()
        conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/final-inspect', methods=['GET', 'POST'])
@login_required
def final_inspect_report():
    conn = get_db()
    if request.method == 'POST':
        if not has_permission('aoi'):
            conn.close()
            return redirect(url_for('final_inspect_report'))

        report_date = request.form.get('report_date')
        shift = request.form.get('shift')
        if 'excel_file' in request.files and request.files['excel_file'].filename:
            file = request.files['excel_file']
            filename = secure_filename(file.filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                flash('Invalid file type')
                conn.close()
                return redirect(url_for('final_inspect_report'))
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
                    r.get('rev'),
                    r.get('job_number'),
                    int(r['qty_inspected'] or 0),
                    int(r['qty_rejected'] or 0),
                    r.get('additional_info', ''),
                )
                for r in rows
            ]
            if records:
                conn.executemany(
                    'INSERT INTO fi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    records,
                )
                conn.commit()
            conn.close()
            return redirect(url_for('final_inspect_report'))

        operator = request.form.get('operator')
        customer = request.form.get('customer')
        assembly = request.form.get('assembly')
        rev = request.form.get('rev')
        job_number = request.form.get('job_number')
        inspected = request.form.get('qty_inspected') or 0
        rejected = request.form.get('qty_rejected') or 0
        additional = request.form.get('additional_info') or ''
        conn.execute(
            'INSERT INTO fi_reports (report_date, shift, operator, customer, assembly, rev, job_number, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?,?,?)',
            (report_date, shift, operator, customer, assembly, rev, job_number, inspected, rejected, additional),
        )
        conn.commit()
        conn.close()
        return redirect(url_for('final_inspect_report'))

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
        f'SELECT * FROM fi_reports {where} ORDER BY report_date DESC, id DESC',
        params,
    ).fetchall()

    op_rows = conn.execute(
        f'SELECT operator, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        f'FROM fi_reports {where} GROUP BY operator ORDER BY inspected DESC',
        params,
    ).fetchall()
    asm_rows = conn.execute(
        f'SELECT assembly, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        f'FROM fi_reports {where} GROUP BY assembly ORDER BY inspected DESC',
        params,
    ).fetchall()
    shift_rows = conn.execute(
        f'SELECT report_date, shift, SUM(qty_inspected) AS inspected, '
        f'SUM(qty_rejected) AS rejected FROM fi_reports {where} '
        f'GROUP BY report_date, shift ORDER BY report_date, shift',
        params,
    ).fetchall()
    cust_rows = conn.execute(
        f'SELECT customer, SUM(qty_rejected)*1.0/SUM(qty_inspected) AS rate '
        f'FROM fi_reports {where} GROUP BY customer ORDER BY customer',
        params,
    ).fetchall()
    yield_rows = conn.execute(
        f'SELECT report_date, 1 - SUM(qty_rejected)*1.0/SUM(qty_inspected) AS yield '
        f'FROM fi_reports {where} GROUP BY report_date ORDER BY report_date',
        params,
    ).fetchall()
    customer_opts = [r['customer'] for r in conn.execute('SELECT DISTINCT customer FROM fi_reports ORDER BY customer').fetchall()]
    shift_opts = [r['shift'] for r in conn.execute('SELECT DISTINCT shift FROM fi_reports ORDER BY shift').fetchall()]
    operator_opts = [r['operator'] for r in conn.execute('SELECT DISTINCT operator FROM fi_reports ORDER BY operator').fetchall()]
    assembly_opts = [r['assembly'] for r in conn.execute('SELECT DISTINCT assembly FROM fi_reports ORDER BY assembly').fetchall()]
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
        'final_inspect.html',
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
        report_base='final-inspect',
    )


@app.route('/final-inspect/report-data')
@login_required
def final_inspect_report_data():
    if not has_permission('aoi'):
        return jsonify(error='Forbidden'), 403
    freq = request.args.get('freq', 'daily').lower()
    start = request.args.get('start')
    end = request.args.get('end')
    group_map = {
        'daily': '%Y-%m-%d',
        'weekly': '%Y-%W',
        'monthly': '%Y-%m',
        'yearly': '%Y',
    }
    days_map = {
        'daily': 1,
        'weekly': 7,
        'monthly': 30,
        'yearly': 365,
    }
    group = group_map.get(freq)
    if not group:
        return jsonify(error='Invalid frequency'), 400

    conn = get_db()
    if start and end:
        try:
            start_date = datetime.strptime(start, '%Y-%m-%d').date()
            end_date = datetime.strptime(end, '%Y-%m-%d').date()
        except ValueError:
            conn.close()
            return jsonify(error='Invalid date format'), 400
    else:
        delta = days_map.get(freq)
        if not delta:
            conn.close()
            return jsonify(error='Invalid frequency'), 400
        end_row = conn.execute('SELECT MAX(report_date) AS max_date FROM fi_reports').fetchone()
        if not end_row or not end_row['max_date']:
            conn.close()
            return jsonify(operators=[], shift_totals=[], customer_rates=[], yield_series=[], assemblies=[])
        end_date = datetime.strptime(end_row['max_date'], '%Y-%m-%d').date()
        start_date = end_date - timedelta(days=delta - 1)

    params = [start_date.isoformat(), end_date.isoformat()]

    op_rows = conn.execute(
        'SELECT operator, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        'FROM fi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY operator ORDER BY inspected DESC',
        params,
    ).fetchall()
    asm_rows = conn.execute(
        'SELECT assembly, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        'FROM fi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY assembly ORDER BY inspected DESC',
        params,
    ).fetchall()
    shift_rows = conn.execute(
        'SELECT shift, SUM(qty_inspected) AS inspected, SUM(qty_rejected) AS rejected '
        'FROM fi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY shift ORDER BY shift',
        params,
    ).fetchall()
    cust_rows = conn.execute(
        'SELECT customer, SUM(qty_rejected)*1.0/SUM(qty_inspected) AS rate '
        'FROM fi_reports WHERE report_date BETWEEN ? AND ? '
        'GROUP BY customer ORDER BY customer',
        params,
    ).fetchall()
    yield_rows = conn.execute(
        f"SELECT strftime('{group}', report_date) AS period, "
        "1 - SUM(qty_rejected)*1.0/SUM(qty_inspected) AS yield "
        "FROM fi_reports WHERE report_date BETWEEN ? AND ? "
        "GROUP BY period ORDER BY period",
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
            'period': r['period'],
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


@app.route('/final-inspect/sql', methods=['POST'])
@login_required
def final_inspect_sql():
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
    allowed_tables = {'fi_reports'}
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


@app.route('/final-inspect/<int:row_id>', methods=['DELETE'])
@login_required
def delete_final_inspect_record(row_id):
    if not has_permission('aoi'):
        return jsonify(error='Forbidden'), 403
    try:
        conn = get_db()
        conn.execute('DELETE FROM fi_reports WHERE id = ?', (row_id,))
        conn.commit()
        conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/final-inspect/html/<path:filename>')
@login_required
def final_inspect_html(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

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
            filename = secure_filename(file.filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                flash('Invalid file type')
                return redirect(url_for('analysis'))
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)

            engine = 'xlrd' if ext == '.xls' else 'openpyxl'

            df = pd.read_excel(save_path, engine=engine, header=5, usecols='B:I')
            df = df[df.iloc[:, 0] != 'Total']
            df.columns = [
                'model_name','total_boards','total_parts_per_board','total_parts',
                'ng_parts','ng_ppm','falsecall_parts','falsecall_ppm'
            ]
            df['upload_time'] = datetime.utcnow().isoformat()
            df['filename'] = filename

            base = os.path.splitext(filename)[0].replace('_', ' ')
            match = re.search(r'(\d{4}-\d{1,2}-\d{1,2}).*(L(?:Offline|[0-2]))', base, re.IGNORECASE)
            report_date = match.group(1) if match else None
            if report_date:
                try:
                    report_date = datetime.strptime(report_date, '%Y-%m-%d').date().isoformat()
                except ValueError:
                    report_date = None
            line_val = match.group(2) if match else None
            if line_val and line_val.upper() == 'LOFFLINE':
                line_val = 'LOffline'
            df['report_date'] = report_date
            df['line'] = line_val

            conn = get_db()
            df.to_sql('moat', conn, if_exists='append', index=False)
            conn.close()

        return redirect(url_for('analysis', view='moat'))

    # GET: determine if MOAT view
    args = request.args
    if args.get('view') == 'moat':
        show = True
        conn = get_db()
        rows = conn.execute('SELECT * FROM moat ORDER BY report_date DESC, id DESC').fetchall()
        conn.close()

        total_rows = len(rows)
        if total_rows:
            report_dates = [
                date.fromisoformat(r['report_date'])
                for r in rows
                if r['report_date']
            ]
            if report_dates:
                earliest = min(report_dates).isoformat()
                latest = max(report_dates).isoformat()
            else:
                earliest = latest = ''
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
    query = (
        f'SELECT model_name, report_date, '
        f'{column}*1.0/total_boards AS rate, total_boards '
        'FROM moat WHERE 1=1'
    )
    params = []
    if start:
        query += ' AND report_date >= ?'
        params.append(start)
    if end:
        query += ' AND report_date <= ?'
        params.append(end)
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
    if threshold:
        query += ' AND total_boards >= ?'
        params.append(threshold)
    query += ' ORDER BY report_date, model_name'
    data = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([
        {
            'model': r['model_name'],
            'rate': r['rate'],
            'boards': r['total_boards'],
            'report_date': r['report_date'],
        }
        for r in data
    ])

@app.route('/analysis/stddev-data')
@login_required
def stddev_data():
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
        query += ' AND report_date >= ?'
        params.append(start)
    if end:
        query += ' AND report_date <= ?'
        params.append(end)
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
    rows = conn.execute(query, params).fetchall()
    conn.close()
    rates = [r['rate'] for r in rows]
    if rates:
        mean = sum(rates) / len(rates)
        variance = sum((x - mean) ** 2 for x in rates) / len(rates)
        stdev = variance ** 0.5
    else:
        mean = stdev = 0
    return jsonify({'mean': mean, 'stdev': stdev, 'rates': [{'model': r['model_name'], 'rate': r['rate']} for r in rows]})
@app.route('/analysis/report-data')
@login_required
def analysis_report_data():
    if not has_permission('analysis') or not has_permission('reports'):
        return jsonify(error='Forbidden'), 403
    freq = request.args.get('freq', 'daily').lower()
    group_map = {
        'daily': '%Y-%m-%d',
        'weekly': '%Y-%W',
        'monthly': '%Y-%m',
        'yearly': '%Y',
    }
    days_map = {
        'daily': 1,
        'weekly': 7,
        'monthly': 30,
        'yearly': 365,
    }
    group = group_map.get(freq)
    delta = days_map.get(freq)
    if not group or not delta:
        return jsonify(error='Invalid frequency'), 400

    conn = get_db()
    end_row = conn.execute('SELECT MAX(report_date) AS max_date FROM moat').fetchone()
    if not end_row or not end_row['max_date']:
        conn.close()
        return jsonify(labels=[], falsecall_ppm=[], ng_ppm=[], table=[])

    end_date = date.fromisoformat(end_row['max_date'])
    start_date = end_date - timedelta(days=delta - 1)
    params = [start_date.isoformat(), end_date.isoformat()]

    rows = conn.execute(
        f"""
        SELECT strftime('{group}', report_date) AS period,
               SUM(total_boards) AS boards,
               SUM(falsecall_parts)*1000000.0/SUM(total_parts) AS fc_ppm,
               SUM(ng_parts)*1000000.0/SUM(total_parts) AS ng_ppm
        FROM moat
        WHERE report_date BETWEEN ? AND ?
        GROUP BY period
        ORDER BY period
        """,
        params,
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


@app.route('/reports')
@login_required
def reports():
    if not has_permission('reports'):
        return redirect('/')
    return render_template('reports.html')

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
@csrf.exempt
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


@app.route('/analysis/compare')
@login_required
def compare_aoi_fi():
    if not has_permission('analysis'):
        return redirect(url_for('analysis'))
    start = request.args.get('start')
    end = request.args.get('end')
    conn = get_db()
    # Aggregate AOI yields
    aoi_params = []
    aoi_query = (
        'SELECT report_date, SUM(qty_inspected) AS inspected, '
        'SUM(qty_rejected) AS rejected FROM aoi_reports WHERE 1=1'
    )
    if start:
        aoi_query += ' AND report_date >= ?'
        aoi_params.append(start)
    if end:
        aoi_query += ' AND report_date <= ?'
        aoi_params.append(end)
    aoi_query += ' GROUP BY report_date ORDER BY report_date'
    aoi_summary = conn.execute(aoi_query, aoi_params).fetchall()

    fi_params = []
    fi_query = (
        'SELECT report_date, SUM(qty_inspected) AS inspected, '
        'SUM(qty_rejected) AS rejected FROM fi_reports WHERE 1=1'
    )
    if start:
        fi_query += ' AND report_date >= ?'
        fi_params.append(start)
    if end:
        fi_query += ' AND report_date <= ?'
        fi_params.append(end)
    fi_query += ' GROUP BY report_date ORDER BY report_date'
    fi_summary = conn.execute(fi_query, fi_params).fetchall()

    def build_series(rows):
        series = []
        for r in rows:
            inspected = r['inspected'] or 0
            rejected = r['rejected'] or 0
            yield_val = 1 - (rejected / inspected) if inspected else None
            series.append({'date': r['report_date'], 'yield': yield_val})
        return series

    aoi_series = build_series(aoi_summary)
    fi_series = build_series(fi_summary)

    raw_params = []
    aoi_raw_query = (
        'SELECT report_date, shift, operator, customer, assembly, rev, job_number, '
        'qty_inspected, qty_rejected, additional_info FROM aoi_reports WHERE 1=1'
    )
    if start:
        aoi_raw_query += ' AND report_date >= ?'
        raw_params.append(start)
    if end:
        aoi_raw_query += ' AND report_date <= ?'
        raw_params.append(end)
    aoi_raw_query += ' ORDER BY report_date DESC, id DESC'
    aoi_rows = conn.execute(aoi_raw_query, raw_params).fetchall()
    aoi_rows = [dict(r) for r in aoi_rows]

    raw_params = []
    fi_raw_query = (
        'SELECT report_date, shift, operator, customer, assembly, rev, job_number, '
        'qty_inspected, qty_rejected, additional_info FROM fi_reports WHERE 1=1'
    )
    if start:
        fi_raw_query += ' AND report_date >= ?'
        raw_params.append(start)
    if end:
        fi_raw_query += ' AND report_date <= ?'
        raw_params.append(end)
    fi_raw_query += ' ORDER BY report_date DESC, id DESC'
    fi_rows = conn.execute(fi_raw_query, raw_params).fetchall()
    fi_rows = [dict(r) for r in fi_rows]

    # Compute operator grades similar to the operator_grades view
    grade_rows = conn.execute(
        """
        WITH a AS (
            SELECT operator, job_number, assembly, SUM(qty_rejected) AS aoi_rejected
            FROM aoi_reports
            WHERE job_number IS NOT NULL AND job_number != ''
            GROUP BY operator, job_number, assembly
        ),
        f AS (
            SELECT job_number, assembly, SUM(qty_rejected) AS fi_rejected
            FROM fi_reports
            WHERE job_number IS NOT NULL AND job_number != ''
            GROUP BY job_number, assembly
        )
        SELECT a.operator, SUM(a.aoi_rejected) AS aoi_rejected, SUM(f.fi_rejected) AS fi_rejected
        FROM a
        LEFT JOIN f ON a.job_number = f.job_number AND a.assembly = f.assembly
        GROUP BY a.operator
        ORDER BY a.operator
        """
    ).fetchall()

    def compute_grade(aoi_rej: int, fi_rej: int):
        total = aoi_rej + fi_rej
        if total == 0:
            return None, None
        coverage = aoi_rej / total
        if coverage >= 0.8:
            letter = 'A'
        elif coverage >= 0.6:
            letter = 'B'
        elif coverage >= 0.4:
            letter = 'C'
        else:
            letter = 'D'
        return coverage, letter

    grades = []
    for r in grade_rows:
        a_rej = r['aoi_rejected'] or 0
        f_rej = r['fi_rejected'] or 0
        coverage, letter = compute_grade(a_rej, f_rej)
        grades.append({'operator': r['operator'], 'coverage': coverage, 'grade': letter})

    conn.close()

    return render_template(
        'compare_aoi_fi.html',
        aoi_series=aoi_series,
        fi_series=fi_series,
        aoi_rows=aoi_rows,
        fi_rows=fi_rows,
        grades=grades,
        start=start,
        end=end,
    )


@app.route('/analysis/compare/jobs')
@login_required
def compare_job_numbers():
    """Return joined AOI and Final Inspect data for a given job number."""
    if not has_permission('analysis'):
        return jsonify(error='Forbidden'), 403
    job_number = request.args.get('job_number')
    if not job_number:
        return jsonify(error='job_number is required'), 400
    conn = get_db()
    row = conn.execute(
        """
        SELECT
            COALESCE(a.job_number, f.job_number) AS job_number,
            a.operator AS aoi_operator,
            a.qty_inspected AS aoi_inspected,
            a.qty_rejected AS aoi_rejected,
            f.operator AS fi_operator,
            f.qty_inspected AS fi_inspected,
            f.qty_rejected AS fi_rejected
        FROM aoi_reports a
        LEFT JOIN fi_reports f ON a.job_number = f.job_number
        WHERE a.job_number = ?
        UNION
        SELECT
            COALESCE(a.job_number, f.job_number) AS job_number,
            a.operator AS aoi_operator,
            a.qty_inspected AS aoi_inspected,
            a.qty_rejected AS aoi_rejected,
            f.operator AS fi_operator,
            f.qty_inspected AS fi_inspected,
            f.qty_rejected AS fi_rejected
        FROM fi_reports f
        LEFT JOIN aoi_reports a ON a.job_number = f.job_number
        WHERE f.job_number = ?
        LIMIT 1
        """,
        (job_number, job_number),
    ).fetchone()
    conn.close()
    if not row:
        return jsonify(error='job not found'), 404

    def build(prefix: str):
        op = row[f'{prefix}_operator']
        inspected = row[f'{prefix}_inspected']
        rejected = row[f'{prefix}_rejected']
        if op is None and inspected is None and rejected is None:
            return None
        inspected = inspected or 0
        rejected = rejected or 0
        yield_val = 1 - (rejected / inspected) if inspected else None
        return {
            'operator': op,
            'inspected': inspected,
            'rejected': rejected,
            'yield': yield_val,
        }

    return jsonify(
        job_number=row['job_number'],
        aoi=build('aoi'),
        fi=build('fi'),
    )


@app.route('/analysis/operator-grades')
@login_required
def operator_grades():
    """Display or return AOI operator grading data."""
    if not has_permission('analysis'):
        return redirect(url_for('analysis'))

    conn = get_db()
    rows = conn.execute(
        """
        WITH a AS (
            SELECT operator, job_number, assembly, SUM(qty_rejected) AS aoi_rejected
            FROM aoi_reports
            WHERE job_number IS NOT NULL AND job_number != ''
            GROUP BY operator, job_number, assembly
        ),
        f AS (
            SELECT job_number, assembly, SUM(qty_rejected) AS fi_rejected
            FROM fi_reports
            WHERE job_number IS NOT NULL AND job_number != ''
            GROUP BY job_number, assembly
        )
        SELECT a.operator, SUM(a.aoi_rejected) AS aoi_rejected, SUM(f.fi_rejected) AS fi_rejected
        FROM a
        LEFT JOIN f ON a.job_number = f.job_number AND a.assembly = f.assembly
        GROUP BY a.operator
        ORDER BY a.operator
        """
    ).fetchall()
    conn.close()

    def compute_grade(aoi_rej: int, fi_rej: int):
        total = aoi_rej + fi_rej
        if total == 0:
            return None, None
        coverage = aoi_rej / total
        if coverage >= 0.8:
            letter = 'A'
        elif coverage >= 0.6:
            letter = 'B'
        elif coverage >= 0.4:
            letter = 'C'
        else:
            letter = 'D'
        return coverage, letter

    grades = []
    for r in rows:
        a_rej = r['aoi_rejected'] or 0
        f_rej = r['fi_rejected']
        if f_rej is None:
            coverage = None
            letter = None
        else:
            f_rej = f_rej or 0
            coverage, letter = compute_grade(a_rej, f_rej)
        grades.append({'operator': r['operator'], 'coverage': coverage, 'grade': letter})

    if request.args.get('format') == 'json':
        return jsonify(grades=grades)

    return render_template('operator_grades.html', grades=grades)


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

