function getAdminTokenTtl() {
  return process.env.ADMIN_JWT_TTL || '24h';
}

module.exports = {
  getAdminTokenTtl
};
