import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PreviewLoginForm } from "@/components/preview-login-form"
import { loadPreviewFixtureAccounts } from "@/lib/preview-login-accounts"
import { isPreviewPasswordLoginEnabled, type PreviewFixtureAccount } from "@/lib/preview-login"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "Preview Sign-In",
  robots: { index: false, follow: false },
}

interface PreviewLoginPageProps {
  searchParams: Promise<{ email?: string; error?: string; redirect?: string }>
}

export default async function PreviewLoginPage({ searchParams }: PreviewLoginPageProps) {
  if (!isPreviewPasswordLoginEnabled()) {
    notFound()
  }

  const params = await searchParams
  let accounts: PreviewFixtureAccount[] = []
  let fixtureError = ""

  try {
    accounts = await loadPreviewFixtureAccounts()
  } catch (error) {
    console.error("[preview-login] fixture account load failed", error)
    fixtureError = "Preview fixtures could not be loaded. Run the preview seeder, or check the preview database."
  }

  return (
    <PreviewLoginForm
      accounts={accounts}
      defaultEmail={params.email}
      error={params.error}
      redirectTo={params.redirect ?? ""}
      fixtureError={fixtureError}
    />
  )
}
