import os
import sys
import pytest

sys.path.append(os.getcwd())
from run import AOI_HEADER_REGEX, _parse_date, _date_from_filename


def test_header_with_slash_parentheses():
    cell = "AOI Something Shift (8/7/25)"
    m = AOI_HEADER_REGEX.search(cell)
    assert m
    assert m.group(1) == "Something"
    date_str = m.group(2) or m.group(3)
    assert _parse_date(date_str) == "2025-08-07"


def test_header_dash_no_parentheses():
    cell = "AOI Solder Shift 8-7-2025"
    m = AOI_HEADER_REGEX.search(cell)
    assert m
    date_str = m.group(2) or m.group(3)
    assert _parse_date(date_str) == "2025-08-07"


def test_date_from_filename_fallback():
    cell = "AOI Solder Shift"
    assert AOI_HEADER_REGEX.search(cell) is None
    filename = "report_8-7-2025.xlsx"
    assert _date_from_filename(filename) == "2025-08-07"


def test_manual_date_fallback():
    cell = "AOI Solder Shift"
    assert AOI_HEADER_REGEX.search(cell) is None
    filename = "report.xlsx"
    assert _date_from_filename(filename) is None
    manual_date = "2025-08-07"
    report_date = _date_from_filename(filename) or manual_date or ""
    assert report_date == manual_date
