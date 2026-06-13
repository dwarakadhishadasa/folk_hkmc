"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { currentProgramProfile } from "@/lib/current-program"

interface RegistrationData {
  name: string
  mobile: string
  age: string
  occupation: string
  year: string
  location: string
}

export function RegistrationForm() {
  const { branding } = currentProgramProfile
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const { toast } = useToast()
  const [formData, setFormData] = useState<RegistrationData>({
    name: "",
    mobile: "",
    age: "",
    occupation: "",
    year: "",
    location: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleOccupationChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      occupation: value,
      year: value === "Working" ? "Unknown" : prev.year,
    }))
  }

      const handleYearChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      year: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json().catch(() => ({}))

      if (response.status === 202 && data.queued) {
        toast({
          title: "Registration saved offline",
          description: "It will sync when the app is back online.",
        })
        return
      }

      if (response.status === 409 && data.alreadyRegistered) {
        toast({
          title: "Already registered",
          description: "No duplicate registration was created.",
        })
        return
      }

      if (!response.ok) throw new Error(data.error || "Failed to register")

      setIsSuccess(true)
      toast({
        title: "Registration Successful!",
        description: "Thank you for registering with Folk Chennai.",
      })

      setTimeout(() => {
        setIsSuccess(false)
        setFormData({
          name: "",
          mobile: "",
          age: "",
          occupation: "",
          year: "",
          location: "",
        })
      }, 2000)
    } catch {
      toast({
        title: "Error",
        description: "Failed to submit registration. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Card className="border-none shadow-lg">
        <CardHeader className="bg-primary text-primary-foreground rounded-t-lg">
          <CardTitle className="text-xl">New Registration</CardTitle>
          <CardDescription className="text-primary-foreground/80">
            Join {branding.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="Enter your name"
                value={formData.name}
                onChange={handleChange}
                required
                className="focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile Number *</Label>
              <Input
                id="mobile"
                name="mobile"
                type="tel"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={formData.mobile}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 10)
                  setFormData((prev) => ({ ...prev, mobile: value }))
                }}
                required
                pattern="[0-9]{10}"
                maxLength={10}
                className="focus-visible:ring-primary"
              />
              {formData.mobile && formData.mobile.length !== 10 && (
                <p className="text-sm text-destructive">Mobile number must be exactly 10 digits</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Age *</Label>
              <Input
                id="age"
                name="age"
                type="number"
                inputMode="numeric"
                placeholder="Enter age"
                value={formData.age}
                onChange={handleChange}
                required
                min={1}
                max={120}
                className="focus-visible:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation *</Label>
              <Select value={formData.occupation || undefined} onValueChange={handleOccupationChange}>
                <SelectTrigger className="focus:ring-primary">
                  <SelectValue placeholder="Select occupation type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Studying">Student</SelectItem>
                  <SelectItem value="Working">Working Professional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.occupation === "Studying" && (
              <div className="space-y-2">
                <Label htmlFor="year">Year </Label>
                <Select value={formData.year || undefined} onValueChange={handleYearChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1st year">1st Year</SelectItem>
                    <SelectItem value="2nd year">2nd Year</SelectItem>
                    <SelectItem value="3rd year">3rd Year</SelectItem>
                    <SelectItem value="4th year">4th Year</SelectItem>
                    <SelectItem value="Passed Out">Passed Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          <div className="space-y-2">
            <Label htmlFor="location">location</Label>
            <Input id="location" name="location" placeholder="Enter your location" value={formData.location} onChange={handleChange} />
          </div>

            <Button type="submit" className="w-full text-lg py-6" disabled={isSubmitting || isSuccess}>
              {isSubmitting ? "Submitting..." : isSuccess ? "✓ Registered Successfully!" : "Register Now"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Toaster />
    </>
  )
}
