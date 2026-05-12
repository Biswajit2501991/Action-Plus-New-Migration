export function requirePermission(code) {
  return (req, res, next) => {
    const perms = req.auth?.permissions || [];
    if (!perms.includes(code)) return res.status(403).json({ error: 'forbidden', code });
    return next();
  };
}
