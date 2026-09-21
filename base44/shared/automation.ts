// Global automation-toggle helpers.
// The AutomationSetting singleton (name='global') drives platform-wide
// auto-approval. These helpers read it once so every auto-submit / auto-approve
// function shares a single source of truth.

// Load the global automation config record (or null if missing).
export async function getAutomationConfig(base44) {
  try {
    const cfg = await base44.asServiceRole.entities.AutomationSetting.filter({ name: 'global' });
    return (cfg && cfg[0]) || null;
  } catch (e) {
    return null;
  }
}

// True when a specific auto-approve toggle (e.g. 'auto_approve_curators') is on.
// FAIL-OPEN: when no global config record exists (or it can't be read), every
// auto-flow defaults to ON so submissions never stall in a manual queue.
// An explicit `false` on the toggle is still respected.
export async function autoApproveOn(base44, key) {
  const c = await getAutomationConfig(base44);
  if (!c) return true;
  return !!c[key];
}

// True when ANY auto-approve toggle is on — the master "auto-approve everything"
// signal for the cross-section submission engine. FAIL-OPEN when no config exists.
export async function anyAutoApproveOn(base44) {
  const c = await getAutomationConfig(base44);
  if (!c) return true;
  return !!(
    c.auto_approve_talent ||
    c.auto_approve_events ||
    c.auto_approve_curators ||
    c.auto_approve_influencers ||
    c.auto_approve_sponsors
  );
}