import { invokeCore } from './invoke';
import { validateFinance } from './finance-model';
export async function loadFinance() {
  return validateFinance(await invokeCore<unknown>('core-finance'));
}
