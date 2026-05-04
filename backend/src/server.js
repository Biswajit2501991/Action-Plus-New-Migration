import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { query, withTransaction } from './db/adapter.js';
import { requireAuth } from './middleware/requireAuth.js';
import { resolveTenant, requirePermission } from './middleware/resolveTenant.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

function normalizeHost(rawHost) {
  return (rawHost || '').toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
}

function tokenHash(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function parseBranchIds(rawValue) {
  if (Array.isArray(rawValue)) return rawValue.filter(Boolean);
  if (typeof rawValue !== 'string' || !rawValue.trim()) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function resolveTenantIdForLogin(req, identifier) {
  const host = normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const domainResult = await query(
      `select tenant_id
       from tenant_domains
       where lower(host) = $1
       limit 1`,
      [host],
    );
    if (domainResult.rowCount) return domainResult.rows[0].tenant_id;
  }

  const providedTenantSlug = (req.body?.tenantSlug || '').trim().toLowerCase();
  if (providedTenantSlug) {
    const tenantResult = await query(`select id from tenants where lower(slug) = $1 limit 1`, [
      providedTenantSlug,
    ]);
    if (tenantResult.rowCount) return tenantResult.rows[0].id;
  }

  const singleTenantResult = await query(
    `select tenant_id
     from users
     where lower(email) = lower($1) or lower(username) = lower($1)
     group by tenant_id
     limit 2`,
    [identifier],
  );
  if (singleTenantResult.rowCount === 1) return singleTenantResult.rows[0].tenant_id;

  return null;
}

async function loadUserClaims(userId, executor = query) {
  const rolesResult = await executor(
    `select distinct r.name
     from user_roles ur
     join roles r on r.id = ur.role_id
     where ur.user_id = $1`,
    [userId],
  );
  const permissionsResult = await executor(
    `select distinct p.code
     from user_roles ur
     join role_permissions rp on rp.role_id = ur.role_id
     join permissions p on p.id = rp.permission_id
     where ur.user_id = $1`,
    [userId],
  );

  return {
    roles: rolesResult.rows.map((row) => row.name),
    permissions: permissionsResult.rows.map((row) => row.code),
  };
}

function signAuthToken({ tenantId, userId, roles, permissions }) {
  return jwt.sign({ tenantId, userId, roles, permissions }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

async function readJsonCollection(key, fallback = []) {
  const result = await query(
    `select value_json
     from app_kv
     where key = $1
     limit 1`,
    [key],
  );
  if (!result.rowCount) return fallback;
  try {
    const parsed = JSON.parse(result.rows[0].value_json || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function writeJsonCollection(key, value) {
  const payload = JSON.stringify(Array.isArray(value) ? value : []);
  await query(
    `insert into app_kv (key, value_json, updated_at)
     values ($1, $2, CURRENT_TIMESTAMP)
     on conflict(key) do update
     set value_json = excluded.value_json,
         updated_at = CURRENT_TIMESTAMP`,
    [key, payload],
  );
}

app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true, service: 'gym-backend', env: env.NODE_ENV });
});
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'gym-backend', env: env.NODE_ENV });
});

app.get('/api/members', async (_req, res) => {
  const members = await readJsonCollection('apg.members', []);
  res.json(members);
});

app.put('/api/members/bulk', async (req, res) => {
  await writeJsonCollection('apg.members', req.body?.members || []);
  res.json({ ok: true });
});

app.get('/api/users', async (_req, res) => {
  const users = await readJsonCollection('apg.users', []);
  res.json(users);
});

app.put('/api/users/bulk', async (req, res) => {
  await writeJsonCollection('apg.users', req.body?.users || []);
  res.json({ ok: true });
});

app.post('/api/v1/auth/login', async (req, res) => {
  const identifier = (req.body?.identifier || req.body?.id || '').trim();
  const password = req.body?.password || '';
  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier-password-required' });
  }

  const tenantId = await resolveTenantIdForLogin(req, identifier);
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant-unresolved', message: 'Provide tenantSlug or valid host' });
  }

  const userResult = await query(
    `select id, tenant_id, email, username, full_name, password_hash, status
     from users
     where tenant_id = $1
       and (lower(email) = lower($2) or lower(username) = lower($2))
     limit 1`,
    [tenantId, identifier],
  );
  if (!userResult.rowCount) return res.status(401).json({ error: 'invalid-credentials' });

  const user = userResult.rows[0];
  if (user.status !== 'active') return res.status(403).json({ error: 'user-inactive' });

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return res.status(401).json({ error: 'invalid-credentials' });

  const { roles, permissions } = await loadUserClaims(user.id);
  const token = signAuthToken({ tenantId: user.tenant_id, userId: user.id, roles, permissions });

  await query(`update users set last_login_at = now(), updated_at = now() where id = $1`, [user.id]);

  return res.json({
    token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      username: user.username,
      fullName: user.full_name,
      roles,
      permissions,
    },
  });
});

app.get('/api/v1/auth/me', requireAuth, resolveTenant, (req, res) => {
  res.json({
    tenantId: req.tenant.id,
    userId: req.auth.userId,
    roles: req.auth.roles,
    permissions: req.auth.permissions,
  });
});

app.get(
  '/api/v1/settings',
  requireAuth,
  resolveTenant,
  requirePermission('settings.managePlans'),
  (_req, res) => {
    // TODO: read tenant_settings from database
    res.json({ data: {} });
  },
);

app.post('/api/v1/invites/accept', async (req, res) => {
  const rawToken = (req.body?.token || '').trim();
  const password = req.body?.password || '';
  const fullName = (req.body?.fullName || '').trim();

  if (!rawToken || !password) {
    return res.status(400).json({ error: 'token-password-required' });
  }

  const hashedInviteToken = tokenHash(rawToken);

  const accepted = await withTransaction(async (client) => {
    const inviteResult = await client.query(
      `select id, tenant_id, email, role_id, branch_ids, expires_at, accepted_at
       from invites
       where token_hash = $1
       limit 1`,
      [hashedInviteToken],
    );
    if (!inviteResult.rowCount) return { error: 'invalid-invite', status: 400 };

    const invite = inviteResult.rows[0];
    if (invite.accepted_at) return { error: 'invite-already-accepted', status: 409 };
    if (new Date(invite.expires_at).getTime() < Date.now()) return { error: 'invite-expired', status: 400 };

    const passwordHash = await bcrypt.hash(password, 12);
    const existingUserResult = await client.query(
      `select id, username
       from users
       where tenant_id = $1 and lower(email) = lower($2)
       limit 1`,
      [invite.tenant_id, invite.email],
    );

    let userId;
    if (existingUserResult.rowCount) {
      userId = existingUserResult.rows[0].id;
      await client.query(
        `update users
         set password_hash = $1,
             full_name = coalesce(nullif($2, ''), full_name),
             status = 'active',
             blocked_reason = null,
             updated_at = now()
         where id = $3`,
        [passwordHash, fullName, userId],
      );
    } else {
      const usernameBase = invite.email.split('@')[0].replace(/[^a-z0-9_.-]/gi, '').toLowerCase() || 'user';
      const username = `${usernameBase}_${Math.floor(1000 + Math.random() * 9000)}`;
      const insertedUser = await client.query(
        `insert into users (tenant_id, email, username, password_hash, full_name, status)
         values ($1, $2, $3, $4, $5, 'active')
         returning id`,
        [invite.tenant_id, invite.email, username, passwordHash, fullName || invite.email],
      );
      userId = insertedUser.rows[0].id;
    }

    await client.query(
      `insert into user_roles (user_id, role_id)
       values ($1, $2)
       on conflict (user_id, role_id) do nothing`,
      [userId, invite.role_id],
    );

    const branchIds = parseBranchIds(invite.branch_ids);
    for (const branchId of branchIds) {
      await client.query(
        `insert into user_branches (user_id, branch_id)
         values ($1, $2)
         on conflict (user_id, branch_id) do nothing`,
        [userId, branchId],
      );
    }

    await client.query(`update invites set accepted_at = now() where id = $1`, [invite.id]);

    const userResult = await client.query(
      `select id, tenant_id, email, username, full_name
       from users
       where id = $1`,
      [userId],
    );
    const user = userResult.rows[0];
    const claims = await loadUserClaims(user.id, (text, params) => client.query(text, params));
    const token = signAuthToken({
      tenantId: user.tenant_id,
      userId: user.id,
      roles: claims.roles,
      permissions: claims.permissions,
    });

    return {
      token,
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        roles: claims.roles,
        permissions: claims.permissions,
      },
    };
  });

  if (accepted.error) {
    return res.status(accepted.status).json({ error: accepted.error });
  }
  return res.json(accepted);
});

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend scaffold listening on :${env.PORT}`);
});
