"use client"

import { useFormStatus } from "react-dom"
import { AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth-form-styles"

export function PreviewLoginSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending} className={AUTH_PRIMARY_BUTTON_CLASS}>
      {pending ? "Signing in..." : "Sign in"}
    </button>
  )
}
