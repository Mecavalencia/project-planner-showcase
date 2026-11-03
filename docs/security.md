# Security notes

## Implemented controls

- OIDC sign-in through Keycloak.
- API JWT validation against Keycloak's JWKS.
- Global roles and project-specific permissions enforced by the API.
- Project membership checks for task, milestone, Gantt, and audit routes.
- Signed, short-lived URLs for file downloads.
- `.env` excluded from Git; the committed realm template uses placeholders.
- Audit records for important actions.
- Development authentication bypass disabled by default.

## Sensitive surfaces

OIDC tokens, Vault files, task and membership endpoints, Gantt date changes, and file permissions require special attention when deploying the app.

## Before production use

- Generate new secrets for every environment and rotate any development credentials that were reused.
- Enable HTTPS and MFA in Keycloak.
- Restrict CORS to the real deployment origins.
- Add rate limiting and malware scanning for uploaded files.
- Separate credentials by environment and review fine-grained Vault permissions.
- Run dependency, secret, and security checks against the exact release revision.

This list is a deployment checklist, not a claim that the app has undergone a complete security audit.
