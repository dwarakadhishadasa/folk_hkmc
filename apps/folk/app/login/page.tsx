import { LoginPageClient } from "./login-page-client"
import { isPreviewPasswordLoginEnabled } from "@/lib/preview-login"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export default function LoginPage() {
  return <LoginPageClient previewPasswordLoginEnabled={isPreviewPasswordLoginEnabled()} />
}
