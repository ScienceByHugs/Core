import { avatarPanel } from './avatar'
import { supabase } from './services/supabase'
import { pushPanel } from './push'

export let accountMutationInProgress = false

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

export function accountScreen(email: string, recovery = false) {
  return `<section class="account-screen" aria-labelledby="account-title">
    <div class="panel-head account-heading"><div><span class="eyebrow">YOUR ACCOUNT</span><h1 class="dashboard-title" id="account-title" tabindex="-1">Account</h1><p class="muted">Your profile, security, and notifications.</p></div></div>
    <div class="account-grid">
      <section class="panel account-card" aria-labelledby="account-profile-title">
        <h3 id="account-profile-title">Profile</h3>
        ${avatarPanel(true)}
        <form id="account-profile-form">
          <label>Display name<input id="account-name" maxlength="80" autocomplete="nickname" placeholder="How should we call you?"></label>
          <label>Email<input type="email" value="${escapeHtml(email)}" readonly autocomplete="email"></label>
          <p class="muted account-note">This is the email you use to sign in to core.</p>
          <button class="primary" type="submit">Save profile</button>
          <p id="account-profile-status" role="status" aria-live="polite"></p>
        </form>
      </section>
      <section class="panel account-card" aria-labelledby="account-security-title">
        <h3 id="account-security-title">Security</h3>
        <form id="account-password-form">
          ${recovery ? '<p class="account-note">Choose your new password to finish account recovery.</p>' : '<label>Current password<input id="account-current-password" type="password" required autocomplete="current-password"></label>'}
          <label>New password<input id="account-new-password" type="password" minlength="8" required autocomplete="new-password"></label>
          <label>Confirm new password<input id="account-confirm-password" type="password" minlength="8" required autocomplete="new-password"></label>
          <small>Use at least 8 characters.</small>
          <button class="primary" type="submit">Change password</button>
          <button class="text-button" id="account-reset-password" type="button">Send password reset email</button>
          <p id="account-password-status" role="status" aria-live="polite"></p>
        </form>
      </section>
      <section class="panel account-card account-notifications" aria-labelledby="account-notifications-title">
        <h3 id="account-notifications-title">Notifications</h3>
        ${pushPanel()}
        <a href="#notifications" class="ghost">Open operational alerts</a>
      </section>
      <section class="panel account-card account-session" aria-labelledby="account-session-title">
        <h3 id="account-session-title">Session</h3>
        <p class="muted">Sign out of core and turn off push notifications on this device.</p>
        <button class="ghost" id="account-sign-out" type="button">Sign out</button>
        <p id="account-signout-status" role="status" aria-live="polite"></p>
      </section>
    </div>
  </section>`
}

export async function bindAccount(email: string, recovery = false, onRecovered = () => {}) {
  const name = document.querySelector<HTMLInputElement>('#account-name')!
  const profileStatus = document.querySelector<HTMLElement>('#account-profile-status')!
  const passwordStatus = document.querySelector<HTMLElement>('#account-password-status')!
  const profileForm = document.querySelector<HTMLFormElement>('#account-profile-form')!
  const passwordForm = document.querySelector<HTMLFormElement>('#account-password-form')!
  const { data: { session } } = await supabase.auth.getSession()
  name.value = session?.user.user_metadata?.display_name ?? ''

  profileForm.addEventListener('submit', async event => {
    event.preventDefault()
    if (accountMutationInProgress) return
    const button = profileForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
    button.disabled = true
    accountMutationInProgress = true
    profileStatus.textContent = 'Saving…'
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: name.value.trim() } })
      if (error) throw error
      profileStatus.textContent = 'Profile saved.'
    } catch (error) { profileStatus.textContent = error instanceof Error ? error.message : 'Could not save your profile.' }
    finally { accountMutationInProgress = false; button.disabled = false }
  })

  passwordForm.addEventListener('submit', async event => {
    event.preventDefault()
    if (accountMutationInProgress) return
    const currentPassword = document.querySelector<HTMLInputElement>('#account-current-password')?.value ?? ''
    const password = document.querySelector<HTMLInputElement>('#account-new-password')!.value
    const confirmation = document.querySelector<HTMLInputElement>('#account-confirm-password')!.value
    if (password !== confirmation) { passwordStatus.textContent = 'New passwords do not match.'; return }
    const button = passwordForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
    button.disabled = true
    accountMutationInProgress = true
    passwordStatus.textContent = 'Updating…'
    try {
      if (!recovery) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
        if (signInError) throw signInError
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      passwordForm.reset()
      passwordStatus.textContent = 'Password updated.'
      if (recovery) onRecovered()
    } catch (error) { passwordStatus.textContent = error instanceof Error ? error.message : 'Could not change your password.' }
    finally { accountMutationInProgress = false; button.disabled = false }
  })

  document.querySelector('#account-reset-password')!.addEventListener('click', async () => {
    if (accountMutationInProgress) return
    accountMutationInProgress = true
    const button = document.querySelector<HTMLButtonElement>('#account-reset-password')!
    button.disabled = true
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      passwordStatus.textContent = 'Password reset email sent. Check your inbox.'
    } catch (error) { passwordStatus.textContent = error instanceof Error ? error.message : 'Could not send a reset email.' }
    finally { accountMutationInProgress = false; button.disabled = false }
  })
}
