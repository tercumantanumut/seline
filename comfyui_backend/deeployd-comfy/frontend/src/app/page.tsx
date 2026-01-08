import { WorkflowDashboard } from '@/components/workflow-dashboard';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <h1 className="text-4xl font-bold mb-8">ComfyUI Workflow Dashboard</h1>
        <WorkflowDashboard />
      </div>
    </main>
  );
}