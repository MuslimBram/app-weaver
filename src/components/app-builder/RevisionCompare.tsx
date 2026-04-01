import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { History, RotateCcw, ArrowLeftRight, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Revision {
  id: string;
  revision_number: number;
  change_summary: string | null;
  generation_id: string | null;
  created_at: string;
}

interface FileData {
  path: string;
  content: string;
}

export default function RevisionCompare({ projectId, onRestore }: { projectId: string; onRestore: () => void }) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareRevA, setCompareRevA] = useState<Revision | null>(null);
  const [compareRevB, setCompareRevB] = useState<Revision | null>(null);
  const [filesA, setFilesA] = useState<FileData[]>([]);
  const [filesB, setFilesB] = useState<FileData[]>([]);
  const [viewFile, setViewFile] = useState<string | null>(null);

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

  const handleCompare = async (revA: Revision, revB: Revision) => {
    setCompareRevA(revA);
    setCompareRevB(revB);

    const [resA, resB] = await Promise.all([
      supabase.from('app_files').select('path, content').eq('project_id', projectId).eq('revision_id', revA.id),
      supabase.from('app_files').select('path, content').eq('project_id', projectId).eq('revision_id', revB.id),
    ]);

    setFilesA((resA.data as any) || []);
    setFilesB((resB.data as any) || []);
    setCompareOpen(true);
  };

  const handleRestore = async (revisionId: string) => {
    try {
      const { data: files } = await supabase
        .from('app_files')
        .select('*')
        .eq('project_id', projectId)
        .eq('revision_id', revisionId);

      if (!files || files.length === 0) {
        toast.error('No files found for this revision');
        return;
      }

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
    } catch {
      toast.error('Failed to restore');
    }
  };

  // Compute diff between two sets of files
  const diffFiles = () => {
    const allPaths = new Set([...filesA.map(f => f.path), ...filesB.map(f => f.path)]);
    const diffs: Array<{ path: string; status: 'added' | 'removed' | 'modified' | 'unchanged' }> = [];

    for (const path of allPaths) {
      const inA = filesA.find(f => f.path === path);
      const inB = filesB.find(f => f.path === path);

      if (!inA) diffs.push({ path, status: 'added' });
      else if (!inB) diffs.push({ path, status: 'removed' });
      else if (inA.content !== inB.content) diffs.push({ path, status: 'modified' });
      else diffs.push({ path, status: 'unchanged' });
    }

    return diffs.sort((a, b) => {
      const order = { added: 0, removed: 1, modified: 2, unchanged: 3 };
      return order[a.status] - order[b.status];
    });
  };

  const statusColors = {
    added: 'text-success bg-success/10',
    removed: 'text-destructive bg-destructive/10',
    modified: 'text-warning bg-warning/10',
    unchanged: 'text-muted-foreground bg-muted/30',
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Revision History & Compare</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : revisions.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No revisions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {revisions.map((rev, i) => (
              <div key={rev.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Revision #{rev.revision_number}</div>
                  <p className="text-sm text-muted-foreground truncate">{rev.change_summary || 'No summary'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(rev.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-1 ml-3">
                  {i < revisions.length - 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCompare(rev, revisions[i + 1])}
                      title="Compare with previous"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleRestore(rev.id)}>
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Compare Dialog */}
        <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Compare: Rev #{compareRevA?.revision_number} → Rev #{compareRevB?.revision_number}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-2">
                {diffFiles().map(d => (
                  <div key={d.path} className="flex items-center justify-between p-2 rounded text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[d.status]}`}>
                        {d.status}
                      </span>
                      <span className="font-mono text-xs">{d.path}</span>
                    </div>
                    {d.status === 'modified' && (
                      <Button variant="ghost" size="sm" onClick={() => setViewFile(viewFile === d.path ? null : d.path)}>
                        <Eye className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
