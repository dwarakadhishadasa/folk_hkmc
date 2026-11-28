import type { ReactNode } from "react"

import {
  AUTH_PANEL_BODY_CLASS,
  AUTH_PANEL_CLASS,
  AUTH_PANEL_HEADER_CLASS,
} from "@/components/auth-form-styles"
import { Header } from "@/components/header"
import { cn } from "@/lib/utils"

import { LoadingRegion } from "./loading-region"
import { ShimmerEffect } from "./shimmer-effect"
import { Skeleton } from "./skeleton"

export function AuthFormSkeleton({ fields = 3, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn(AUTH_PANEL_CLASS, "relative overflow-hidden", className)} data-auth-skeleton="">
      <div className={cn(AUTH_PANEL_HEADER_CLASS, "space-y-3")}>
        <Skeleton className="h-6 w-2/5 rounded-md bg-primary-foreground/25" />
        <Skeleton className="h-4 w-3/5 rounded-full bg-primary-foreground/20" />
      </div>
      <div className={cn(AUTH_PANEL_BODY_CLASS, "space-y-6")}>
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
      <ShimmerEffect />
    </div>
  )
}

export function LoginPageSkeleton({
  label = "Checking your session",
  children,
}: {
  label?: string
  children?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-md px-4 py-8 sm:py-12">
        <LoadingRegion label={label}>
          <AuthFormSkeleton fields={2} />
          {children}
        </LoadingRegion>
      </main>
    </div>
  )
}

export function RegisterPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-lg px-4 py-6 sm:py-10">
        <LoadingRegion label="Loading the registration form">
          <AuthFormSkeleton fields={4} />
        </LoadingRegion>
      </main>
    </div>
  )
}
