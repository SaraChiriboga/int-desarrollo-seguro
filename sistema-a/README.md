# Sistema A – Cliente OIDC (SEC-03)

Node.js + Express. Delega login a Keycloak (Authorization Code + PKCE, cliente confidencial), 2FA TOTP lo exige Keycloak.
BD propia: SQLite en `data/sistema-a.db` (independiente de la BD de Keycloak).

## Ejecutar
```bash
cd sistema-a
npm install
cp .env.example .env     # completar OIDC_CLIENT_SECRET y SESSION_SECRET
npm start                # http://localhost:3000
```
Keycloak debe estar encendido (`docker compose up -d` en la raíz) y accederse SIEMPRE por `localhost` (no mezclar con 127.0.0.1: el `iss` del token debe coincidir).

## Roles (RBAC)
Crear en Keycloak, Realm roles: `sistema-a-user` y `sistema-a-admin`, y asignarlos a los usuarios de prueba.
`/dashboard` requiere sesión; `/admin` requiere `sistema-a-admin`.

## Controles de seguridad implementados
PKCE S256, state y nonce; validación de firma/iss/aud/exp del ID token y del access token (JWKS);
regeneración de sesión tras login; cookie httpOnly + sameSite; logout POST con CSRF + SSO logout en Keycloak;
anti open-redirect; consultas SQL parametrizadas; helmet; rate limit en /login y /callback; auditoría en BD; sin secretos en código.

## SAST
`pip install semgrep && npm run sast`
