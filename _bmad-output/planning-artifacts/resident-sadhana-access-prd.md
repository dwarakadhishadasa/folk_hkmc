---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
inputDocuments:
  - /home/dwarakadas/projects/hkmc/folk_hkmc/docs/project-overview.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/docs/architecture.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/docs/data-models.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/docs/development-guide.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/docs/api-contracts.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/docs/component-inventory.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/docs/source-tree-analysis.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/_bmad-output/planning-artifacts/prd.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/_bmad-output/planning-artifacts/architecture.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/_bmad-output/planning-artifacts/epics.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc/_bmad-output/project-context.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc_airtable/docs/architecture.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc_airtable/docs/data-models.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc_airtable/docs/project-overview.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc_airtable/_bmad-output/implementation-artifacts/supabase-airtable-portal-implementation-plan.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc_airtable/_bmad-output/planning-artifacts/airtable-auth-portal-plan.md
  - /home/dwarakadas/projects/hkmc/folk_hkmc_airtable/_bmad-output/planning-artifacts/airtable-auth-portal-epics-and-stories.md
documentCounts:
  productBriefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 17
workflowType: 'prd'
project_name: 'folk_hkmc'
user_name: 'Dwaraka'
date: '2026-05-21'
projectContext: 'brownfield'
featureScope: 'Resident user role with inherited Volunteer access and daily Sadhana tracking'
classification:
  projectType: web_app
  domain: general community/spiritual-residency operations
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document - Resident Sadhana Access

**Author:** Dwaraka
**Date:** 2026-05-21

## Executive Summary

This brownfield PRD defines a new `Resident` user type for the existing FOLK HKMC web app and Airtable operations system. Residents are people staying in FOLK residencies who are interested in practicing spiritual life and need authenticated access to submit daily Sadhana entries as part of ISKCON norms. A Resident must automatically inherit all current Volunteer access, including the ability to create contacts through the existing staff contact-entry flow.

The change extends the current Supabase-backed staff authentication model, Airtable `Users` authorization source, and Airtable `Contacts` person records. It must avoid creating duplicate user identities for the same person. One `Users` record with `Role = Resident` should represent both the resident's volunteer capability and their Sadhana submission capability.

### What Makes This Special

The product connects service and spiritual practice in one operational identity. A Resident is not merely a contact, a volunteer, or a Sadhana form submitter; the same person participates in outreach and tracks daily practice while living in a FOLK residency.

The core product insight is role inheritance: `Resident = Volunteer access + Sadhana access`. This keeps the app simple for users, keeps authorization maintainable for developers, and keeps Airtable records clean for operators.

## Project Classification

- **Project Type:** Web app / PWA extension
- **Domain:** Community and spiritual-residency operations
- **Complexity:** Medium
- **Project Context:** Brownfield enhancement to the existing Next.js, Supabase, and Airtable system
