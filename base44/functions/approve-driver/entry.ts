import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { safeEmail } from '../../shared/safeIntegration.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const payload = await req.json().catch(() => ({}));
    const driverId = payload?.driver_id;
    if (!driverId || typeof driverId !== 'string') {
      return Response.json({ error: 'driver_id required' }, { status: 400 });
    }

    const driver = await base44.asServiceRole.entities.Driver.get(driverId);
    if (!driver) return Response.json({ error: 'Driver not found' }, { status: 404 });

    // Flip the profile to approved so the driver can go online from the Driver App.
    await base44.asServiceRole.entities.Driver.update(driverId, { is_approved: true });

    // Pull the linked user account to get the login email (username).
    let email = driver.email || '';
    let fullName = driver.full_name || 'Driver';
    if (driver.created_by_id) {
      try {
        const u = await base44.asServiceRole.entities.User.get(driver.created_by_id);
        if (!email && u?.email) email = u.email;
        if (u?.full_name) fullName = u.full_name;
      } catch {}
    }

    let emailed = false;
    if (email) {
      const vehicle = `${driver.vehicle_type || ''}${driver.license_plate ? ' · ' + driver.license_plate : ''}`.trim();
      const emailBody = `Hi ${fullName},

Great news — your Ride X driver profile has been approved! You can now go online and start accepting ride bookings.

HOW TO LOG IN TO THE DRIVER PORTAL
1. Open the Ride X app.
2. Log in with your email (your username): ${email}
   - Use your existing password, or "Continue with Google" if that's how you signed up.
   - Forgot it? Use "Forgot password" on the login screen to reset it.
3. Tap "Driver App", then tap "Go online".

Once you're online, Ride X automatically sends you ride pings from the customers closest to you — accept a ping to start earning. Stay online to keep receiving nearby bookings.

Vehicle on file: ${vehicle || 'n/a'}

Welcome to the team,
Ride X`;

      await safeEmail(base44, {
        to: email,
        subject: "You're approved to drive with Ride X",
        body: emailBody,
      });
      emailed = true;
    }

    return Response.json({ ok: true, approved: true, emailed, email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}