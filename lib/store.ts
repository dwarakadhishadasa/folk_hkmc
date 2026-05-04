export interface Registration {
  id: string
  name: string
  mobile: string
  age: number
  occupation: string
  collegeName?: string
  city?: string
  centerId?: string
  createdAt: Date
}

export interface Attendance {
  id: string
  mobile: string
  userName: string
  centerId: string
  centerName: string
  createdAt: Date
}

// Shared storage (replace with database in production)
export const registrations: Registration[] = []
export const attendances: Attendance[] = []

export interface Center {
  id: string // Now using numeric string IDs
  name: string
  location: string
}

export const CENTERS: Center[] = [
  { id: "1", name: "Anna Nagar", location: "Chennai" },
  { id: "2", name: "Velachery", location: "Chennai" },
  { id: "3", name: "Tambaram", location: "Chennai" },
  { id: "4", name: "Porur", location: "Chennai" },
  { id: "5", name: "Adyar", location: "Chennai" },
]

// Helper to find center by ID
export function findCenterById(id: string): Center | undefined {
  return CENTERS.find((c) => c.id === id)
}

// Helper to find registration by mobile
export function findRegistrationByMobile(mobile: string): Registration | undefined {
  const normalizedMobile = mobile.replace(/\D/g, "").slice(-10)
  return registrations.find((r) => {
    const regMobile = r.mobile.replace(/\D/g, "").slice(-10)
    return regMobile === normalizedMobile
  })
}
