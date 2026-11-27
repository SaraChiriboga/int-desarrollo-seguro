'use strict';
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Issuer, generators } = require('openid-client');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const db = require('./db');

// ---------- Configuración (sin secretos hardcodeados) ----------
const required = ['KEYCLOAK_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'SESSION_SECRET', 'BASE_URL'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Falta la variable de entorno ${k}. Revisa .env.example`);
    process.exit(1);
  }
}
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL.replace(/\/$/, '');
const REDIRECT_URI = `${BASE_URL}/callback`;
const ADMIN_ROLE = process.env.ADMIN_ROLE || 'sistema-a-admin';
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_MINUTES = 30;

// Solo se aceptan rutas internas como destino post-login (evita Open Redirect)
function safeReturnTo(p) {
  return typeof p === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(p) ? p : '/dashboard';
}

async function main() {
  // ---------- Discovery OIDC ----------
  const issuer = await Issuer.discover(process.env.KEYCLOAK_ISSUER);
  const client = new issuer.Client({
    client_id: process.env.OIDC_CLIENT_ID,
    client_secret: process.env.OIDC_CLIENT_SECRET, // cliente confidencial
    redirect_uris: [REDIRECT_URI],
    post_logout_redirect_uris: [`${BASE_URL}/`],
    response_types: ['code'],
  });
  const jwks = createRemoteJWKSet(new URL(issuer.metadata.jwks_uri));

  // ---------- App ----------
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');

  const idpOrigin = new URL(issuer.metadata.issuer).origin;

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'form-action': ["'self'", idpOrigin],
      },
    },
  }));

  app.use('/static', express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false }));

  app.use(session({
    name: 'sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD,
      maxAge: SESSION_MINUTES * 60 * 1000,
    },
  }));

  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.csrf = req.session.csrf || '';
    res.locals.adminRole = ADMIN_ROLE;
    next();
  });

  // ---------- Middleware de autenticación / autorización ----------
  const requireAuth = (req, res, next) => {
    if (req.session.user) return next();
    return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
  };
  const requireRole = (role) => (req, res, next) => {
    if (req.session.user && req.session.user.roles.includes(role)) return next();
    db.logEvent(req.session.user && req.session.user.sub, `ACCESO_DENEGADO ${req.originalUrl}`, req.ip);
    return res.status(403).render('error', { title: '403 - Prohibido', message: 'No tienes el rol necesario para ver esta página.' });
  };

  const loginLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

  // ---------- Rutas ----------
  app.get('/', (req, res) => res.render('index', { title: 'Sistema A' }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // 1) Inicio del flujo Authorization Code + PKCE
  app.get('/login', loginLimiter, (req, res) => {
    const code_verifier = generators.codeVerifier();
    const state = generators.state();
    const nonce = generators.nonce();
    req.session.oidc = { code_verifier, state, nonce, returnTo: safeReturnTo(req.query.returnTo) };
    const url = client.authorizationUrl({
      scope: 'openid profile email',
      code_challenge: generators.codeChallenge(code_verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    req.session.save(() => res.redirect(url));
  });

  // 2) Callback: intercambia code por tokens y valida firma, iss, aud, nonce, exp
  app.get('/callback', loginLimiter, async (req, res, next) => {
    try {
      const saved = req.session.oidc;
      if (!saved) return res.status(400).render('error', { title: 'Error', message: 'Sesión de login no encontrada. Intenta de nuevo.' });

      const params = client.callbackParams(req);
      const tokenSet = await client.callback(REDIRECT_URI, params, {
        code_verifier: saved.code_verifier,
        state: saved.state,
        nonce: saved.nonce,
      });
      const claims = tokenSet.claims(); // id_token ya validado por openid-client

      // Los roles viven en el access token (JWT): se verifica su firma con el JWKS de Keycloak
      const { payload } = await jwtVerify(tokenSet.access_token, jwks, { issuer: issuer.metadata.issuer });
      const roles = ((payload.realm_access && payload.realm_access.roles) || []).filter((r) => r.startsWith('sistema-a-'));

      const user = {
        sub: claims.sub,
        username: claims.preferred_username || '',
        email: claims.email || '',
        nombre: claims.name || claims.preferred_username || '',
        roles,
        acr: claims.acr || null,
        authTime: claims.auth_time || null,
      };
      db.upsertUser({ ...user, roles: roles.join(',') });
      db.logEvent(user.sub, 'LOGIN_OK', req.ip);

      const returnTo = saved.returnTo;
      const idToken = tokenSet.id_token;
      // Regenerar el ID de sesión tras autenticar (previene Session Fixation)
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = user;
        req.session.idToken = idToken; // solo server-side, se usa en el logout
        req.session.csrf = crypto.randomBytes(24).toString('hex');
        req.session.save(() => res.redirect(returnTo));
      });
    } catch (e) {
      db.logEvent(null, `LOGIN_FALLIDO ${e.message}`.slice(0, 200), req.ip);
      next(e);
    }
  });

  app.get('/dashboard', requireAuth, (req, res) => {
    res.render('dashboard', { title: 'Dashboard', record: db.getUser(req.session.user.sub) });
  });

  app.get('/admin', requireAuth, requireRole(ADMIN_ROLE), (req, res) => {
    res.render('admin', { title: 'Administración', users: db.listUsers(), log: db.listLog() });
  });

  // 3) Logout (POST + token CSRF) con cierre de sesión también en Keycloak (SSO logout)
  app.post('/logout', requireAuth, (req, res) => {
    const a = Buffer.from(String(req.body.csrf || ''));
    const b = Buffer.from(req.session.csrf || '');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).render('error', { title: '403', message: 'Token CSRF inválido.' });
    }
    const { sub } = req.session.user;
    const idToken = req.session.idToken;
    db.logEvent(sub, 'LOGOUT', req.ip);
    req.session.destroy(() => {
      res.clearCookie('sid');
      res.redirect(client.endSessionUrl({ id_token_hint: idToken, post_logout_redirect_uri: `${BASE_URL}/` }));
    });
  });

  // 404 y manejador de errores (sin filtrar stack traces al usuario)
  app.use((req, res) => res.status(404).render('error', { title: '404', message: 'Página no encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Ocurrió un error al procesar la autenticación.' });
  });

  app.listen(PORT, () => console.log(`Sistema A en ${BASE_URL} (IdP: ${issuer.metadata.issuer})`));
}

main().catch((e) => {
  console.error('No se pudo iniciar Sistema A. ¿Keycloak está encendido?', e.message);
  process.exit(1);
});
