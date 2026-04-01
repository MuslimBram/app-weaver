import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles } from 'lucide-react';
import UsageDashboard from '@/components/app-builder/UsageDashboard';

export default function UsagePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate('/app-builder')} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to My Apps
        </Button>
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            Usage & Billing
          </h1>
          <p className="text-muted-foreground mt-1">Track your App Builder usage</p>
        </div>
        <UsageDashboard />
      </div>
    </div>
  );
}
