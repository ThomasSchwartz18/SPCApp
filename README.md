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

## Operator Grading

The `/analysis/operator-grades` route compares AOI and Final Inspect
defects per operator. When a job is inspected by multiple operators, the
FI rejects for that job are divided based on each operator's share of the
AOI inspected quantity. Coverage is calculated as:

```
AOI_rejected / (AOI_rejected + weighted_FI_rejected)
```

The coverage percentage determines the letter grade (A–D).

## Analysis Comparison API

The analysis module exposes a small JSON endpoint for correlating
Automated Optical Inspection (AOI) and Final Inspect data by job number.
Use `/analysis/compare/jobs?job_number=<id>` to retrieve operator names,
yields, and inspected/rejected counts from both sources. The front-end
currently logs the response to the console; future iterations will link
job numbers between tables and display details in a modal.

To run the tests using the mock client you can leave `USE_SAP` unset or
explicitly set it to `false`:

```bash
USE_SAP=false pytest tests/test_sap_client.py
```

## Contribution Guidelines

The user-facing documentation lives in `templates/docs.html`. Whenever you add new features or modify settings, update this file so the documentation stays current.

