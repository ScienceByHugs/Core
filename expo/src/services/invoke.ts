import { supabase } from '@/lib/supabase';

// Calls a core-* Edge Function and turns its failures into short, actionable
// messages. Retries only transient server and network errors.
export async function invokeCore<T>(name: string, body: Record<string, unknown> = {}, options: { retry?: boolean } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase.functions.invoke(name, { body, timeout: 15000 });
    if (!error && data?.success !== false) return data as T;

    let message: string = data?.error || 'Could not load this. Try again.';
    let retryable = false;
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        let payload: { error?: string; retryable?: boolean } = {};
        try { payload = await context.clone().json(); } catch {}
        const status = context.status;
        message = payload.error
          || (status === 401 ? 'Your session expired. Sign in again.'
            : status === 403 ? 'core. administrator access is required.'
            : message);
        retryable = [500, 502, 503, 504].includes(status) && payload.retryable !== false;
      } else {
        retryable = error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError';
        if (retryable) message = 'Could not reach the server. Check your connection.';
      }
    }
    if (options.retry === false || !retryable || attempt >= 2) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 750 : 1500));
  }
}
