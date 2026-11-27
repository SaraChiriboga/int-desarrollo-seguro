# 🛡️ Integración de Desarrollo de Software Seguro (ISWZ3206)

Proyecto integrador para la asignatura **ISWZ3206 - Desarrollo de Software Seguro** (Facultad de Ingeniería y Ciencias Aplicadas).

## 🎯 Objetivo General
Integración segura entre dos aplicaciones web (Sistema A y Sistema B) en entornos desacoplados mediante:
1. **Control de Identidades Centralizado:** Autenticación, Autorización, SSO, 2FA Móvil (TOTP) y Federación de Usuarios utilizando **Keycloak**.
2. **Cifrado de Comunicaciones:** Invocación de servicios entre Sistema A y Sistema B mediante encriptación con KMS de un tercero.
3. **Seguridad y Calidad de Código:** Análisis estático con herramientas SAST (OWASP Top 10) y evaluación de ética algorítmica.
4. **Metodología Ágil:** Gestión por Sprints en Jira bajo el framework Scrum.

---

## 🏗️ Arquitectura del Sistema (Sprint 1)

* **IAM (Keycloak 24+):** `http://localhost:8080` (Base de datos PostgreSQL en puerto `5432`).
* **Sistema A (Cliente OIDC):** `http://localhost:3000` (Servidor independiente con base de datos local).
* **Sistema B (Receptor Seguro):** `http://localhost:4000` (Sprint 2).

---

## 🚀 Inicio Rápido (Servidor de Identidad - Keycloak)

### Requisitos
* Docker y Docker Compose instalados.

### Despliegue de Keycloak con PostgreSQL
```bash
docker compose up -d
```

* **Consola de Administración:** [http://localhost:8080/admin](http://localhost:8080/admin)
* **Usuario:** `admin`
* **Contraseña:** `AdminSecurePass2026!`

---

## 👥 Equipo y Distribución de Roles (4 Integrantes)

* **Integrante 1:** Scrum Master & Cloud/Infra Lead (Docker, Redes, Jira).
* **Integrante 2:** IAM & Security Engineer (Keycloak Realm, Clientes OIDC, 2FA TOTP).
* **Integrante 3:** Software Engineer A (Desarrollo Sistema A, Middleware OIDC).
* **Integrante 4:** SecOps & QA Lead (SAST Semgrep/SonarQube, Auditoría y Ética Algorítmica).

---

## Configuración de Keycloak para Sistema A

### Iniciar Keycloak

Desde la carpeta del repositorio, con Docker Desktop abierto, ejecutar:

```powershell
docker compose up -d
```

La consola local estará en `http://127.0.0.1:8080/admin`. Usa las credenciales definidas * **Usuario:*
* `admin`
* **Contraseña:** `AdminSecurePass2026!`

### Crear la configuración del proyecto

En la consola de Keycloak, crear y habilitar el Realm `SecureDev-Realm`, y dentro de él crear el cliente OIDC `sistema-a-client`.

Configurar el cliente según la integración local del Sistema A:

- Redirect URI: `http://localhost:3000/*`
- Web origin: `http://localhost:3000`
- Activar **Standard flow**.
- Habilitar **Configure OTP** como acción requerida predeterminada.
- Política OTP: TOTP, SHA1, 6 dígitos y periodo de 30 segundos.

Crear un usuario local de prueba y registrar OTP con una aplicación autenticadora.

### Datos para conectar el Sistema A

- Realm: `SecureDev-Realm`
- Client ID: `sistema-a-client`
- Discovery endpoint: `http://127.0.0.1:8080/realms/SecureDev-Realm/.well-known/openid-configuration`


