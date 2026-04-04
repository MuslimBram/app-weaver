import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Info, AlertCircle, RefreshCw, Filter } from 'lucide-react';

interface LogEntry {
  id: string;
  log_type: string;
  message: string;
  level: string;
  created_at: string;
  generation_id: string | null;
}

const levelConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  info: { icon: <Info className="w-4 h-4 text-blue-500" />, color: 'border-l-blue-500' },
  warning: { icon: <AlertTriangle className="w-4 h-4 text-yellow-500" />, color: 'border-l-yellow-500' },
  error: { icon: <AlertCircle className="w-4 h-4 text-red-500" />, color: 'border-l-red-500' },
  success: { icon: <CheckCircle className="w-4 h-4 text-green-500" />, color: 'border-l-green-500' },
};

const typeLabels: Record<string, string> = {
  generation: 'Generation',
  spec: 'Specification',
  review: 'Code Review',
  autofix: 'Auto-Fix',
  validation: 'Validation',
  analysis: 'Analysis',
  completion: 'Complete',
  error: 'Error',
};

export default function BuildLogViewer({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const loadLogs = () => {
    setLoading(true);
    supabase
      .from('build_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => { setLogs((data as any) || []); setLoading(false); });
  };

  useEffect(() => { loadLogs(); }, [projectId]);

  const filtered = filter ? logs.filter(l => l.level === filter) : logs;

  const summary = {
    errors: logs.filter(l => l.level === 'error').length,
    warnings: logs.filter(l => l.level === 'warning').length,
    success: logs.filter(l => l.level === 'success').length,
    total: logs.length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Build Logs</CardTitle>
          <div className="flex items-center gap-2">
            {summary.total > 0 && (
              <div className="flex gap-1.5">
                {summary.errors > 0 && (
                  <Badge variant="outline" className="text-xs cursor-pointer text-red-600 border-red-200 dark:border-red-800" onClick={() => setFilter(filter === 'error' ? null : 'error')}>
                    {summary.errors} errors
                  </Badge>
                )}
                {summary.warnings > 0 && (
                  <Badge variant="outline" className="text-xs cursor-pointer text-yellow-600 border-yellow-200 dark:border-yellow-800" onClick={() => setFilter(filter === 'warning' ? null : 'warning')}>
                    {summary.warnings} warnings
                  </Badge>
                )}
                {summary.success > 0 && (
                  <Badge variant="outline" className="text-xs cursor-pointer text-green-600 border-green-200 dark:border-green-800" onClick={() => setFilter(filter === 'success' ? null : 'success')}>
                    {summary.success} passed
                  </Badge>
                )}
                {filter && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setFilter(null)}>
                    Clear
                  </Button>
                )}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={loadLogs}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading logs...</p>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Info className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground">No build logs yet. Logs will appear after generation.</p>
          </div>
        ) : (
          <ScrollArea className="h-[450px]">
            <div className="space-y-1.5">
              {filtered.map(log => {
                const config = levelConfig[log.level] || levelConfig.info;
                return (
                  <div key={log.id} className={`flex items-start gap-3 p-3 rounded-lg bg-muted/20 text-sm border-l-2 ${config.color}`}>
                    <div className="mt-0.5 shrink-0">{config.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {typeLabels[log.log_type] || log.log_type}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-xs">{log.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
