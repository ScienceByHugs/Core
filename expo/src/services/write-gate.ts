// One switch for record edits made from core. (orders, customers, catalog),
// matching the admin-tools gate: off unless EXPO_PUBLIC_ENABLE_ADMIN_WRITES is
// exactly "true". Payments and outbound messages keep their own switches.
// This is a client safety net, not authorization; the server must still enforce it.
export const recordEditsEnabled = process.env.EXPO_PUBLIC_ENABLE_ADMIN_WRITES === 'true';

export const recordEditsOffMessage =
  'Editing is off in this build until the staging endpoints are verified. Set EXPO_PUBLIC_ENABLE_ADMIN_WRITES=true to turn it on.';

export function assertRecordEdits() {
  if (!recordEditsEnabled) throw new Error(recordEditsOffMessage);
}
