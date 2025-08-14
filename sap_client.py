from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class Material:
    """Simple data transfer object for material information."""
    id: str
    description: str


class SAPClient(ABC):
    """Interface for low level SAP communication."""

    @abstractmethod
    def get_material_data(self, material_id: str) -> Dict:
        """Return raw material data for *material_id*."""


class RealSAPClient(SAPClient):
    """Placeholder for a real SAP client implementation."""

    def get_material_data(self, material_id: str) -> Dict:
        raise NotImplementedError("Real SAP integration not implemented")


class MockSAPClient(SAPClient):
    """In-memory mock client returning static data or simulating errors."""

    def __init__(self, data: Optional[Dict[str, Dict]] = None, *, should_timeout: bool = False):
        self.data = data or {
            "MAT1": {"id": "MAT1", "description": "Sample material 1"},
            "MAT2": {"id": "MAT2", "description": "Sample material 2"},
        }
        self.should_timeout = should_timeout

    def get_material_data(self, material_id: str) -> Dict:
        if self.should_timeout:
            raise TimeoutError("SAP request timed out")
        return self.data[material_id]


class SAPService:
    """High level service using a SAPClient for business logic."""

    def __init__(self, client: SAPClient):
        self.client = client

    def get_material(self, material_id: str) -> Material:
        data = self.client.get_material_data(material_id)
        return Material(id=data["id"], description=data["description"])


def create_sap_service(use_real: bool = False) -> SAPService:
    """Factory that returns a service wired to either a real or mock client."""
    client: SAPClient = RealSAPClient() if use_real else MockSAPClient()
    return SAPService(client)
