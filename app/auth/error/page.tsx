import { AuthErrorContent } from "@/components/auth-error-content"
import { Header } from "@/components/header"

const messages: Record<string, string> = {
  "invalid-invite": "This invite link is missing required information.",
  "invite-verification-failed": "This invite link is invalid or has expired.",
  "supabase-callback-error": "Supabase could not verify this sign-in link.",
  "staff-authorization-failed": "Your sign-in succeeded, but this email is not authorized as active staff.",
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; message?: string }>
}) {
  const { code, message: detail } = await searchParams
  const message = detail || messages[code || ""] || "We could not complete staff sign-in."

  return (
    <div className="min-h-screen bg-[#FFF9F0]">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-12">
        <AuthErrorContent code={code} message={message} />
      </main>
    </div>
  )
}
