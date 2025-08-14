import pytest
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))
from sap_client import MockSAPClient, SAPService, create_sap_service


def test_mock_service_returns_material():
    service = create_sap_service(use_real=False)
    material = service.get_material('MAT1')
    assert material.id == 'MAT1'
    assert material.description == 'Sample material 1'


def test_missing_material_raises_key_error():
    service = SAPService(MockSAPClient())
    with pytest.raises(KeyError):
        service.get_material('UNKNOWN')


def test_timeout_raises_timeout_error():
    service = SAPService(MockSAPClient(should_timeout=True))
    with pytest.raises(TimeoutError):
        service.get_material('MAT1')
