// Research-access applications as returned by core-research-applications.
export type ResearchStatus = 'pending' | 'approved' | 'denied' | 'withdrawn';

export type ResearchApplication = {
  id: string;
  status: ResearchStatus;
  institution_name: string;
  department: string | null;
  role_title: string;
  principal_investigator: string;
  institutional_email: string;
  email_domain: string;
  research_summary: string;
  document_path: string | null;
  terms_version: string;
  free_domain_override: boolean;
  submitted_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
  expires_at: string | null;
};

export const researchStatuses: Array<[ResearchStatus, string]> = [
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['denied', 'Denied'],
  ['withdrawn', 'Withdrawn'],
];

// Kept in step with private.is_free_email_domain in the database.
const freeDomains = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net',
  'mail.com', 'yandex.com', 'zoho.com', 'zohomail.com', 'tutanota.com', 'tuta.io', 'hey.com', 'fastmail.com',
]);
export const isFreeEmailDomain = (domain: string | null | undefined) => freeDomains.has(String(domain ?? '').trim().toLowerCase());

const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function validateApplications(payload: unknown): ResearchApplication[] {
  const list = (payload as { applications?: unknown })?.applications;
  if (!Array.isArray(list)) throw new Error('The review service returned an unexpected response.');
  for (const row of list) {
    const a = row as Partial<ResearchApplication>;
    if (!text(a.id) || !researchStatuses.some(([s]) => s === a.status) || !text(a.institution_name) || !text(a.institutional_email) || !text(a.submitted_at)) {
      throw new Error('The review service returned an incomplete application.');
    }
  }
  return list as ResearchApplication[];
}

// Same rules the database enforces, checked first so the reviewer gets a clear message.
export function decisionProblem(
  application: Pick<ResearchApplication, 'status' | 'email_domain'>,
  decision: 'approved' | 'denied',
  reason: string,
  allowFreeDomain: boolean,
): string | null {
  if (application.status !== 'pending') return 'Only waiting applications can be reviewed.';
  if (decision === 'denied' && reason.trim().length < 5) return 'Give the applicant a reason for the denial.';
  if (decision === 'approved' && isFreeEmailDomain(application.email_domain) && !allowFreeDomain) {
    return 'This applicant used a personal email domain. Confirm the override to approve anyway.';
  }
  return null;
}

export const daysLeft = (expiresAt: string | null, now = new Date()) =>
  expiresAt ? Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000) : null;
