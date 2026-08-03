function listVisitorSessions(visitorSessions, now = Date.now()) {
  const cutoff = now - 2 * 60 * 1000;

  for (const [id, entry] of visitorSessions.entries()) {
    if (!entry || !entry.lastSeenAt || new Date(entry.lastSeenAt).getTime() < cutoff) {
      visitorSessions.delete(id);
    }
  }

  const uniqueBySessionKey = new Map();
  for (const entry of visitorSessions.values()) {
    const sessionKey = String(entry?.sessionKey || '');
    if (!sessionKey) continue;
    uniqueBySessionKey.set(sessionKey, entry);
  }

  return Array.from(uniqueBySessionKey.values()).sort((a, b) => {
    const nameA = String(a?.name || '');
    const nameB = String(b?.name || '');
    return nameA.localeCompare(nameB);
  });
}

module.exports = { listVisitorSessions };
