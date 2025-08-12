import os
import sys
import pandas as pd

sys.path.append(os.getcwd())
from run import parse_aoi_rows


def test_parse_aoi_rows(tmp_path):
    data = [
        ['Alice', 'Cust1', 'Asm1', 10, 1, 'note1'],
        ['Bob', 'Cust2', 'Asm2', 20, 2, 'note2'],
    ]
    file = tmp_path / 'aoi.xlsx'
    pd.DataFrame(data).to_excel(file, header=False, index=False)
    rows = parse_aoi_rows(str(file))
    assert rows[0]['operator'] == 'Alice'
    assert rows[1]['qty_rejected'] == 2
