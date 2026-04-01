import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Zap, Download, GitBranch, Cpu } from 'lucide-react';

interface UsageEntry {
  id: string;
  action_type: string;
  model_used: string | null;
  token_count: number | null;
  created_at: string;
}

export default function UsageDashboard() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('usage_tracking')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setUsage((data as any) || []);
        setLoading(false);
      });
  }, [user]);

  const stats = useMemo(() => {
    const generations = usage.filter(u => u.action_type === 'initial_generation').length;
    const followUps = usage.filter(u => u.action_type === 'follow_up_generation' || u.action_type === 'follow_up_edit').length;
    const exports = usage.filter(u => u.action_type === 'zip_export').length;
    const pushes = usage.filter(u => u.action_type === 'github_push').length;
    const totalTokens = usage.reduce((sum, u) => sum + (u.token_count || 0), 0);
    return { generations, followUps, exports, pushes, totalTokens };
  }, [usage]);

  const statCards = [
    { label: 'Generations', value: stats.generations, icon: <Zap className="w-5 h-5 text-primary" /> },
    { label: 'Follow-up Edits', value: stats.followUps, icon: <Cpu className="w-5 h-5 text-accent" /> },
    { label: 'ZIP Exports', value: stats.exports, icon: <Download className="w-5 h-5 text-info" /> },
    { label: 'GitHub Pushes', value: stats.pushes, icon: <GitBranch className="w-5 h-5 text-success" /> },
    { label: 'Total Tokens', value: stats.totalTokens.toLocaleString(), icon: <BarChart3 className="w-5 h-5 text-warning" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <div className="flex justify-center mb-2">{s.icon}</div>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : usage.length === 0 ? (
            <p className="text-muted-foreground">No activity yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {usage.slice(0, 50).map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 text-sm">
                  <div>
                    <span className="font-medium capitalize">{u.action_type.replace(/_/g, ' ')}</span>
                    {u.model_used && <span className="text-muted-foreground ml-2">· {u.model_used}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {u.token_count && <span>{u.token_count.toLocaleString()} tokens</span>}
                    <span>{new Date(u.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
