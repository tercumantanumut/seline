import { ApiDocumentation } from '@/components/api-documentation';

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <h1 className="text-4xl font-bold mb-8">API Documentation</h1>
        <ApiDocumentation />
      </div>
    </main>
  );
}