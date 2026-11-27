import Link from "next/link"
import { Header } from "@/components/header"
import {
  AUTH_ERROR_CLASS,
  AUTH_FIELD_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_NOTICE_CLASS,
  AUTH_PANEL_BODY_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_PANEL_HEADER_CLASS,
} from "@/components/auth-form-styles"
import { PreviewLoginSubmitButton } from "@/components/preview-login-submit-button"
import { signInWithPreviewPassword } from "@/lib/preview-login-actions"
import type { PreviewFixtureAccount } from "@/lib/preview-login"

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "That preview account and passcode did not match.",
  "not-staff": "That account is not an active staff user in this program.",
  "rate-limit": "Too many preview sign-in attempts. Wait a minute and try again.",
  server: "Preview sign-in is temporarily unavailable. Try again.",
}

interface PreviewLoginFormProps {
  accounts: PreviewFixtureAccount[]
  defaultEmail?: string
  error?: string
  redirectTo: string
  fixtureError?: string
}

export function PreviewLoginForm({
  accounts,
  defaultEmail,
  error,
  redirectTo,
  fixtureError,
}: PreviewLoginFormProps) {
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.server) : ""
  const canSignIn = accounts.length > 0 && !fixtureError
  const selectedEmail =
    defaultEmail && accounts.some((account) => account.email === defaultEmail)
      ? defaultEmail
      : accounts[0]?.email

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-8 sm:py-12">
        <div className={AUTH_PANEL_CLASS}>
          <div className={AUTH_PANEL_HEADER_CLASS}>
            <h1 className="font-[family-name:var(--font-poppins)] text-xl font-bold">Preview Sign-In</h1>
            <p className="mt-1 text-sm text-white/75">QA password access for the preview environment</p>
          </div>

          <div className={AUTH_PANEL_BODY_CLASS}>
            {fixtureError && (
              <div className={AUTH_ERROR_CLASS} role="alert">
                {fixtureError}
              </div>
            )}

            {!fixtureError && !canSignIn && (
              <div className={AUTH_NOTICE_CLASS}>
                No active preview fixture accounts exist for this program. Run the preview seeder and reload.
              </div>
            )}

            {canSignIn && (
              <form action={signInWithPreviewPassword} className="space-y-6">
                <input type="hidden" name="redirect" value={redirectTo} />

                {errorMessage && (
                  <div className={AUTH_ERROR_CLASS} role="alert">
                    {errorMessage}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="preview-account" className={AUTH_LABEL_CLASS}>
                    Preview account
                  </label>
                  <select
                    id="preview-account"
                    name="email"
                    required
                    defaultValue={selectedEmail}
                    className={AUTH_FIELD_CLASS}
                  >
                    {accounts.map((account) => (
                      <option key={account.email} value={account.email}>
                        {account.role} — {account.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="preview-password" className={AUTH_LABEL_CLASS}>
                    Shared preview passcode
                  </label>
                  <input
                    id="preview-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className={AUTH_FIELD_CLASS}
                  />
                </div>

                <PreviewLoginSubmitButton />
              </form>
            )}

            <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-semibold text-[var(--program-accent)] underline-offset-4 hover:underline"
              >
                Use email code instead
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
