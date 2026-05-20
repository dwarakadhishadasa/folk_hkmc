import { LoginPageClient } from "./login-page-client"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export default function LoginPage() {
  return <LoginPageClient />
}
