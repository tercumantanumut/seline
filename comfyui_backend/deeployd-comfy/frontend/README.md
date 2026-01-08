# ComfyUI Workflow Dashboard Frontend

A modern Next.js 15 dashboard for managing ComfyUI workflows and generating Docker containers.

## Features

- 📊 **Workflow Dashboard** - View, upload, and manage ComfyUI workflows
- 🐳 **Docker Build Monitoring** - Real-time Docker build progress with WebSocket updates
- 📁 **File Upload** - Drag-and-drop workflow JSON files with validation
- 📚 **API Documentation** - Interactive API documentation with testing interface
- 🔄 **Real-time Updates** - WebSocket integration for live build monitoring
- 🎨 **Modern UI** - Built with shadcn/ui components and Tailwind CSS

## Tech Stack

- **Next.js 15** with App Router and Server Components
- **TypeScript** for type safety
- **shadcn/ui** for UI components
- **TanStack Query** for data fetching
- **TanStack Table** for data tables
- **Zustand** for state management
- **WebSockets** for real-time updates
- **Tailwind CSS** for styling

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Main dashboard page
│   └── api-docs/          # API documentation page
├── components/            # React components
│   ├── workflow-dashboard.tsx
│   ├── workflow-table.tsx
│   ├── workflow-upload.tsx
│   ├── build-monitor.tsx
│   └── api-documentation.tsx
├── lib/                   # Utility functions
│   ├── api-client.ts      # API client
│   └── websocket.ts       # WebSocket manager
├── types/                 # TypeScript types
│   └── models.ts          # Database model types
└── providers/             # React providers
    └── query-provider.tsx # React Query provider
```

## API Integration

The frontend connects to the backend API running on `http://localhost:8000` by default. Make sure the backend is running before starting the frontend.

## Building and Deployment

For production deployment:

```bash
# Build the application
npm run build

# The output will be in .next directory
# Deploy using your preferred platform (Vercel, AWS, etc.)
```

## License

MIT
