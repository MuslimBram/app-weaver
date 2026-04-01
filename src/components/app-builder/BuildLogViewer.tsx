import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';

interface LogEntry {
  id: string;
  log_type: string;
  message: string;
  level: string;
  created_at: string;
}

const levelIcons: Record<string, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-info" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
  error: <AlertCircle className="w-4 h-4 text-destructive" />,
  success: <CheckCircle className="w-4 h-4 text-success" />,
};

export default function BuildLogViewer({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('build_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setLogs((data as any) || []);
        setLoading(false);
      });
  }, [projectId]);

  return (
    <Card>
      <CardHeader><CardTitle>Build Logs</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground">No build logs yet. Logs will appear after generation.</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 text-sm">
                  {levelIcons[log.level] || levelIcons.info}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{log.log_type}</span>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{log.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
