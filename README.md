# SPCApp

SPCApp is a small web application for process control.

## Deployment

The application requires a secret key for session management. Set the
`SECRET_KEY` environment variable before starting the server; it is
mandatory and the app will fail to start if it is missing.

## SAP Integration

The application can optionally retrieve material data from SAP. This
behavior is controlled by the `USE_SAP` environment variable. When
`USE_SAP=true` the server will attempt to use a real SAP client. By
default `USE_SAP` is `false` and an in-memory mock client is used that
provides sample materials such as `MAT1` and `MAT2`.

Material information is available through the route
`/sap/material/<material_id>` which returns JSON containing the material
`id` and `description`.

To run the tests using the mock client you can leave `USE_SAP` unset or
explicitly set it to `false`:

```bash
USE_SAP=false pytest tests/test_sap_client.py
```

## Contribution Guidelines

The user-facing documentation lives in `templates/docs.html`. Whenever you add new features or modify settings, update this file so the documentation stays current.

