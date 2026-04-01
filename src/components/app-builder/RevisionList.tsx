import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { History, RotateCcw } from 'lucide-react';

interface Revision {
  id: string;
  revision_number: number;
  change_summary: string | null;
  created_at: string;
}

export default function RevisionList({ projectId, onRestore }: { projectId: string; onRestore: () => void }) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('app_revisions')
      .select('*')
      .eq('project_id', projectId)
      .order('revision_number', { ascending: false })
      .then(({ data }) => {
        setRevisions((data as any) || []);
        setLoading(false);
      });
  }, [projectId]);

  const handleRestore = async (revisionId: string) => {
    try {
      // Get files for this revision
      const { data: files } = await supabase
        .from('app_files')
        .select('*')
        .eq('project_id', projectId)
        .eq('revision_id', revisionId);

      if (!files || files.length === 0) {
        toast.error('No files found for this revision');
        return;
      }

      // Delete current files and re-insert revision files
      await supabase.from('app_files').delete().eq('project_id', projectId);
      
      for (const file of files) {
        await supabase.from('app_files').insert({
          project_id: file.project_id,
          generation_id: file.generation_id,
          path: file.path,
          content: file.content,
          file_type: file.file_type,
        });
      }

      toast.success('Revision restored!');
      onRestore();
    } catch (err: any) {
      toast.error('Failed to restore revision');
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Revision History</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading revisions...</p>
        ) : revisions.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No revisions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {revisions.map(rev => (
              <div key={rev.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <div className="font-medium">Revision #{rev.revision_number}</div>
                  <p className="text-sm text-muted-foreground">{rev.change_summary || 'No summary'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(rev.created_at).toLocaleString()}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleRestore(rev.id)}>
                  <RotateCcw className="w-3 h-3 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
