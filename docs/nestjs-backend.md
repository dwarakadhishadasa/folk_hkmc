# NestJS Backend Reference

This document contains the NestJS backend structure for when you want to deploy a separate backend service.

## Project Structure

\`\`\`
apps/api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── registration/
│   │   ├── registration.module.ts
│   │   ├── registration.controller.ts
│   │   ├── registration.service.ts
│   │   └── dto/create-registration.dto.ts
│   ├── attendance/
│   │   ├── attendance.module.ts
│   │   ├── attendance.controller.ts
│   │   ├── attendance.service.ts
│   │   └── dto/create-attendance.dto.ts
│   └── contact/
│       ├── contact.module.ts
│       ├── contact.controller.ts
│       ├── contact.service.ts
│       └── dto/create-contact.dto.ts
├── package.json
├── tsconfig.json
└── nest-cli.json
\`\`\`

## Setup Instructions

1. Create a new NestJS project:
   \`\`\`bash
   npx @nestjs/cli new api
   cd api
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install class-validator class-transformer
   \`\`\`

3. Generate modules:
   \`\`\`bash
   nest g module registration
   nest g controller registration
   nest g service registration
   \`\`\`

4. Copy the DTOs, services, and controllers from this reference.

## API Endpoints

- `POST /api/registration` - Create a new registration
- `GET /api/registration` - Get all registrations
- `POST /api/attendance` - Mark attendance
- `GET /api/attendance` - Get all attendance records
- `POST /api/contact` - Create a new contact
- `GET /api/contact` - Get all contacts

## Environment Variables

For production, configure:
- `DATABASE_URL` - Database connection string
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Frontend URL for CORS
\`\`\`

\`\`\`json file="apps/api/package.json" isDeleted="true"
...deleted...
