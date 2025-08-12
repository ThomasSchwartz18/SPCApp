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
from xlsx2html import xlsx2html

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.secret_key = os.environ.get('SECRET_KEY', 'spc_secret')
DATABASE = 'spcapp.db'

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
            report_date TEXT,
            shift TEXT,
            operator TEXT,
            customer TEXT,
            assembly TEXT,
            qty_inspected INTEGER,
            qty_rejected INTEGER,
            additional_info TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS permissions (
            feature TEXT PRIMARY KEY,
            allowed INTEGER DEFAULT 0
        )
    ''')
    for feature in ['part_markings', 'aoi', 'analysis']:
        conn.execute(
            'INSERT OR IGNORE INTO permissions (feature, allowed) VALUES (?,0)',
            (feature,),
        )
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
    if session.get('user') == 'ADMIN':
        return True
    conn = get_db()
    row = conn.execute(
        'SELECT allowed FROM permissions WHERE feature = ?', (feature,)
    ).fetchone()
    conn.close()
    return bool(row and row['allowed'])


@app.context_processor
def inject_globals():
    conn = get_db()
    rows = conn.execute('SELECT feature, allowed FROM permissions').fetchall()
    conn.close()
    perms = {r['feature']: bool(r['allowed']) for r in rows}
    return dict(current_user=session.get('user'), permissions=perms)

# --- Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        role = request.form.get('role')
        password = request.form.get('password', '')
        if role == 'ADMIN' and password == 'MasterAdmin':
            session['user'] = 'ADMIN'
            return redirect(url_for('home'))
        elif role == 'USER' and password == 'fuji':
            session['user'] = 'USER'
            return redirect(url_for('home'))
        else:
            error = 'Invalid credentials'
    return render_template('login.html', error=error)


@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))


@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if session.get('user') != 'ADMIN':
        return redirect(url_for('home'))
    conn = get_db()
    features = ['part_markings', 'aoi', 'analysis']
    if request.method == 'POST':
        selected = request.form.getlist('permissions')
        for feat in features:
            conn.execute(
                'UPDATE permissions SET allowed = ? WHERE feature = ?',
                (1 if feat in selected else 0, feat),
            )
        conn.commit()
    rows = conn.execute('SELECT feature, allowed FROM permissions').fetchall()
    conn.close()
    perms = {r['feature']: bool(r['allowed']) for r in rows}
    return render_template('settings.html', permissions=perms)


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

@app.route('/aoi', methods=['GET', 'POST'])
@login_required
def aoi_report():
    conn = get_db()
    if request.method == 'POST' and 'excel_file' in request.files:
        if not has_permission('aoi'):
            conn.close()
            return redirect(url_for('aoi_report'))
        file = request.files['excel_file']
        manual_date = request.form.get('report_date')
        if manual_date:
            try:
                manual_date = datetime.strptime(manual_date, '%Y-%m-%d').date().isoformat()
            except ValueError:
                manual_date = None
        if file and file.filename:
            filename = file.filename
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)

            ext = os.path.splitext(save_path)[1].lower()
            engine = 'xlrd' if ext == '.xls' else 'openpyxl'
            df = pd.read_excel(save_path, engine=engine, header=None, usecols='A:F')

            records = []
            i = 0
            first_report_date = manual_date
            while i < len(df):
                cell = str(df.iloc[i, 0]) if not pd.isna(df.iloc[i, 0]) else ''
                if cell.startswith('AOI') and 'Shift' in cell:
                    m = re.search(r'AOI\s+(.*?)\s+Shift.*\(([^)]+)\)', cell)
                    if m:
                        shift = m.group(1)
                        date_str = m.group(2)
                        if manual_date:
                            report_date = manual_date
                        else:
                            try:
                                report_date = datetime.strptime(date_str, '%m/%d/%y').date().isoformat()
                            except ValueError:
                                report_date = date_str
                        if not first_report_date and report_date:
                            first_report_date = report_date
                    else:
                        shift = ''
                        report_date = manual_date or ''
                    i += 1
                    # move to header row
                    while i < len(df) and str(df.iloc[i,0]) != 'Operator':
                        i += 1
                    i += 1
                    while i < len(df):
                        first = df.iloc[i,0]
                        if pd.isna(first) or str(first).startswith('AOI'):
                            break
                        operator = first
                        customer = df.iloc[i,1]
                        assembly = df.iloc[i,2]
                        inspected = df.iloc[i,3] if not pd.isna(df.iloc[i,3]) else 0
                        rejected = df.iloc[i,4] if not pd.isna(df.iloc[i,4]) else 0
                        additional = df.iloc[i,5] if df.shape[1] > 5 else ''
                        records.append((report_date, shift, operator, customer, assembly,
                                        int(inspected), int(rejected), str(additional) if not pd.isna(additional) else ''))
                        i += 1
                else:
                    i += 1
            if not records:
                conn.close()
                flash('No AOI records found in the uploaded file.')
                return redirect(url_for('aoi_report', view='upload'))
            if records:
                conn.executemany(
                    'INSERT INTO aoi_reports (report_date, shift, operator, customer, assembly, qty_inspected, qty_rejected, additional_info) VALUES (?,?,?,?,?,?,?,?)',
                    records
                )
                conn.commit()
                try:
                    html_name = f"{first_report_date or os.path.splitext(filename)[0]}.html"
                    html_path = os.path.join(app.config['UPLOAD_FOLDER'], html_name)
                    xlsx2html(save_path, html_path)
                except Exception as e:
                    app.logger.error('HTML conversion failed', exc_info=e)
        conn.close()
        return redirect(url_for('aoi_report'))

    view = request.args.get('view')
    if view == 'upload':
        if not has_permission('aoi'):
            conn.close()
            return redirect(url_for('aoi_report'))
        conn.close()
        return render_template('aoi.html', upload=True, available_dates=[])

    selected_date = request.args.get('date')
    date_rows = conn.execute(
        'SELECT DISTINCT report_date FROM aoi_reports ORDER BY report_date DESC'
    ).fetchall()
    available_dates = [r['report_date'] for r in date_rows]
    data = {}
    html_exists = False
    if selected_date:
        rows = conn.execute(
            'SELECT * FROM aoi_reports WHERE report_date = ? ORDER BY shift, id',
            (selected_date,),
        ).fetchall()
        for r in rows:
            data.setdefault(r['shift'], []).append(r)
        html_file = os.path.join(
            app.config['UPLOAD_FOLDER'], f"{selected_date}.html"
        )
        html_exists = os.path.exists(html_file)
    conn.close()
    return render_template(
        'aoi.html',
        upload=False,
        data=data,
        selected_date=selected_date,
        html_exists=html_exists,
        available_dates=available_dates,
    )


@app.route('/aoi/dashboard')
@login_required
def aoi_dashboard():
    if not has_permission('aoi'):
        return redirect(url_for('aoi_report'))

    start = request.args.get('start')
    end = request.args.get('end')
    customer = request.args.get('customer')
    shift = request.args.get('shift')

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
    if shift:
        where += ' AND shift = ?'
        params.append(shift)

    conn = get_db()
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
    customer_opts = [r['customer'] for r in conn.execute(
        'SELECT DISTINCT customer FROM aoi_reports ORDER BY customer'
    ).fetchall()]
    shift_opts = [r['shift'] for r in conn.execute(
        'SELECT DISTINCT shift FROM aoi_reports ORDER BY shift'
    ).fetchall()]
    conn.close()

    operators = []
    for r in op_rows:
        inspected = r['inspected'] or 0
        rejected = r['rejected'] or 0
        yield_rate = 1 - (rejected / inspected) if inspected else 0
        operators.append(
            {
                'operator': r['operator'],
                'inspected': inspected,
                'rejected': rejected,
                'yield': yield_rate,
            }
        )

    assemblies = []
    for r in asm_rows:
        inspected = r['inspected'] or 0
        rejected = r['rejected'] or 0
        yield_rate = 1 - (rejected / inspected) if inspected else 0
        assemblies.append(
            {
                'assembly': r['assembly'],
                'inspected': inspected,
                'rejected': rejected,
                'yield': yield_rate,
            }
        )

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
        'aoi_dashboard.html',
        operators=operators,
        assemblies=assemblies,
        shift_totals=shift_totals,
        customer_rates=customer_rates,
        yield_series=yield_series,
        customers=customer_opts,
        shifts=shift_opts,
        start=start,
        end=end,
        selected_customer=customer,
        selected_shift=shift,
    )

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

    return render_template(
        'analysis.html',
        moat=rows,
        show_moat=show,
        total_rows=total_rows,
        earliest=earliest,
        latest=latest
    )

@app.route('/analysis/chart-data')
@login_required
def chart_data():
    start = request.args.get('start')
    end = request.args.get('end')
    threshold = request.args.get('threshold', type=int, default=0)
    metric = request.args.get('metric', 'fc')
    lines_param = request.args.get('lines', '')
    column = 'falsecall_parts' if metric == 'fc' else 'ng_parts'
    conn = get_db()
    query = f'SELECT model_name, SUM({column})*1.0/SUM(total_boards) AS rate FROM moat WHERE 1=1'
    params = []
    if start:
        query += ' AND upload_time >= ?'
        params.append(f'{start}T00:00:00')
    if end:
        query += ' AND upload_time <= ?'
        params.append(f'{end}T23:59:59')
    if lines_param:
        lines = [l for l in lines_param.split(',') if l]
        if lines:
            clause = ' OR '.join('filename LIKE ?' for _ in lines)
            query += f' AND ({clause})'
            params.extend([f'%{line}%' for line in lines])
    query += ' GROUP BY model_name HAVING SUM(total_boards) >= ?'
    params.append(threshold)
    data = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([{'model': r['model_name'], 'rate': r['rate']} for r in data])

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


@app.route('/aoi/html/<path:filename>')
@login_required
def aoi_html(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

