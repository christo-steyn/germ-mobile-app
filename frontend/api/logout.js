async function finishLogout({ pendingRegistration, isCurrent, getRegistration, unregister, clearSession }) {
  await pendingRegistration;
  if (!isCurrent()) return false;
  const registration = getRegistration();
  if (registration) await unregister(registration);
  if (!isCurrent()) return false;
  await clearSession();
  return true;
}

module.exports = { finishLogout };
