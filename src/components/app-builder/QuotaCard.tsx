import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Zap, Download, GitBranch, AlertTriangle } from 'lucide-react';

// Plan definitions
const PLANS = {
  free: {
    name: 'Free',
    limits: { generations: 5, followUps: 10, exports: 5, githubPushes: 3 },
    color: 'bg-muted text-muted-foreground',
  },
  starter: {
    name: 'Starter',
    limits: { generations: 25, followUps: 50, exports: 25, githubPushes: 15 },
    color: 'bg-primary/10 text-primary',
  },
  pro: {
    name: 'Pro',
    limits: { generations: 100, followUps: 500, exports: 100, githubPushes: 100 },
    color: 'bg-accent/10 text-accent-foreground',
  },
  business: {
    name: 'Business',
    limits: { generations: -1, followUps: -1, exports: -1, githubPushes: -1 }, // -1 = unlimited
    color: 'bg-warning/10 text-warning',
  },
};

type PlanKey = keyof typeof PLANS;

interface UsageCounts {
  generations: number;
  followUps: number;
  exports: number;
  githubPushes: number;
}

export function useQuota() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageCounts>({ generations: 0, followUps: 0, exports: 0, githubPushes: 0 });
  const [plan] = useState<PlanKey>('free'); // Future: fetch from billing table
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadUsage = async () => {
      // Get usage for current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('usage_tracking')
        .select('action_type')
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString());

      if (data) {
        const counts: UsageCounts = { generations: 0, followUps: 0, exports: 0, githubPushes: 0 };
        for (const row of data) {
          switch (row.action_type) {
            case 'initial_generation': counts.generations++; break;
            case 'follow_up_generation':
            case 'follow_up_edit': counts.followUps++; break;
            case 'zip_export': counts.exports++; break;
            case 'github_push': counts.githubPushes++; break;
          }
        }
        setUsage(counts);
      }
      setLoading(false);
    };

    loadUsage();
  }, [user]);

  const limits = PLANS[plan].limits;

  const canGenerate = limits.generations === -1 || usage.generations < limits.generations;
  const canFollowUp = limits.followUps === -1 || usage.followUps < limits.followUps;
  const canExport = limits.exports === -1 || usage.exports < limits.exports;
  const canPush = limits.githubPushes === -1 || usage.githubPushes < limits.githubPushes;

  return { usage, plan, limits, loading, canGenerate, canFollowUp, canExport, canPush, planInfo: PLANS[plan] };
}

export default function QuotaCard() {
  const { usage, plan, limits, loading, planInfo } = useQuota();

  if (loading) return null;

  const items = [
    { label: 'Generations', used: usage.generations, limit: limits.generations, icon: Sparkles },
    { label: 'Follow-ups', used: usage.followUps, limit: limits.followUps, icon: Zap },
    { label: 'ZIP Exports', used: usage.exports, limit: limits.exports, icon: Download },
    { label: 'GitHub Pushes', used: usage.githubPushes, limit: limits.githubPushes, icon: GitBranch },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Monthly Usage</CardTitle>
          <Badge className={planInfo.color}>{planInfo.name}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(item => {
          const isUnlimited = item.limit === -1;
          const pct = isUnlimited ? 0 : Math.min((item.used / item.limit) * 100, 100);
          const isNearLimit = !isUnlimited && pct >= 80;

          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <item.icon className="w-3 h-3 text-muted-foreground" />
                  <span>{item.label}</span>
                </div>
                <span className={isNearLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                  {item.used} / {isUnlimited ? '∞' : item.limit}
                </span>
              </div>
              {!isUnlimited && (
                <Progress
                  value={pct}
                  className="h-1.5"
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
