/** CRM is authoritative for enabled numbers; input never chooses tenant/auth. */
export function automationChannelJobs(response, context) {
  const tenantSlug = context?.tenantSlug;
  if (typeof tenantSlug !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(tenantSlug)) throw new Error('automation-context-unavailable');
  const empty = outcome => [{ tenantSlug, enabled: false, outcome }];
  if (!response || response.error || !Array.isArray(response.channels)) return empty('channels-unavailable');
  if (response.channels.some(row => !row || typeof row.phoneNumberId !== 'string' || !/^\d{1,32}$/.test(row.phoneNumberId))) return empty('channels-unavailable');
  const numbers = [...new Set(response.channels.map(row => row.phoneNumberId))];
  return numbers.length ? numbers.map(phoneNumberId => ({ tenantSlug, phoneNumberId, enabled: true })) : empty('no-enabled-channels');
}

export function automationSyncResult(response, channel) {
  // No snapshot/message/credential is copied into the execution outcome.
  const result = !response?.error && ['synced', 'skipped', 'unavailable'].includes(response?.result) ? response.result : 'unavailable';
  return { tenantSlug: channel.tenantSlug, phoneNumberId: channel.phoneNumberId, enabled: channel.enabled,
    outcome: !channel.enabled ? channel.outcome : result === 'synced' ? 'sync-completed' : result === 'skipped' ? 'sync-skipped' : 'usage-unavailable' };
}
