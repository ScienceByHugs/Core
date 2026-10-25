import { invokeCore } from './invoke';
import { assertRecordEdits } from './write-gate';
import { decisionProblem, validateApplications, type ResearchApplication, type ResearchStatus } from './research-model';

const fn = 'core-research-applications';

export async function loadApplications(status: ResearchStatus): Promise<ResearchApplication[]> {
  return validateApplications(await invokeCore(fn, { action: 'list', status }));
}

// A five-minute link to the applicant's supporting document.
export async function documentLink(applicationId: string): Promise<string> {
  const data = await invokeCore<{ url?: string }>(fn, { action: 'document', applicationId });
  if (typeof data?.url !== 'string' || !data.url.startsWith('https://')) throw new Error('Could not open the document.');
  return data.url;
}

export async function decide(
  application: ResearchApplication,
  decision: 'approved' | 'denied',
  reason: string,
  allowFreeDomain = false,
): Promise<ResearchApplication> {
  assertRecordEdits();
  const problem = decisionProblem(application, decision, reason, allowFreeDomain);
  if (problem) throw new Error(problem);
  const data = await invokeCore<{ application?: ResearchApplication }>(
    fn,
    { action: 'decide', applicationId: application.id, decision, reason: reason.trim() || null, allowFreeDomain },
    { retry: false },
  );
  if (!data?.application) throw new Error('The decision could not be confirmed. Refresh before trying again.');
  return data.application;
}
