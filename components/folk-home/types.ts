export interface RegistrationDraft {
  name: string
  mobileNo: string
  yourArea: string
  areaToAttend: string
  dateOfBirth: string
  collegeName: string
  email: string
}

export type RegistrationField = keyof RegistrationDraft

export type RegistrationErrors = Partial<Record<RegistrationField | "form", string>>

export interface PaymentSelection {
  method: "gpay" | "neft"
  screenshot: File
}
