import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Github, Download, Loader2, FolderOpen } from 'lucide-react';

interface GitHubImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GitHubImportDialog({ open, onOpenChange }: GitHubImportDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const checkConnection = useCallback(async () => {
    const { data } = await supabase.functions.invoke('github-integration', {
      body: { action: 'status' },
    });
    setConnected(data?.connected || false);
    if (data?.connected) {
      loadRepos();
    }
  }, []);

  const loadRepos = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('github-integration', {
        body: { action: 'list-repos' },
      });
      setRepos(data?.repos || []);
    } catch {
      toast.error('Failed to load repos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) checkConnection();
  }, [open, checkConnection]);

  const handleImport = async () => {
    if (!selectedRepo) { toast.error('Select a repo'); return; }
    setImporting(true);

    try {
      const repo = repos.find(r => r.fullName === selectedRepo);
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'import-repo',
          repoFullName: selectedRepo,
          branch: repo?.defaultBranch || selectedBranch,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Imported ${data.filesCount} files from ${selectedRepo}`);
      onOpenChange(false);
      navigate(`/app-builder/project/${data.projectId}`);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" /> Import from GitHub
          </DialogTitle>
        </DialogHeader>

        {!connected ? (
          <div className="text-center py-6">
            <Github className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">
              Connect your GitHub account first to import repos.
            </p>
            <p className="text-xs text-muted-foreground">
              Go to any project → GitHub tab → Connect
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Repository</Label>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading repos...
                </div>
              ) : (
                <Select value={selectedRepo} onValueChange={(v) => {
                  setSelectedRepo(v);
                  const repo = repos.find(r => r.fullName === v);
                  if (repo) setSelectedBranch(repo.defaultBranch || 'main');
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose a repository..." /></SelectTrigger>
                  <SelectContent>
                    {repos.map(r => (
                      <SelectItem key={r.fullName} value={r.fullName}>
                        <div className="flex items-center gap-2">
                          <span>{r.fullName}</span>
                          <span className="text-xs text-muted-foreground">{r.private ? '🔒' : '🌐'}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedRepo && (
              <div className="p-3 rounded-lg bg-muted/30 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="w-4 h-4" />
                  <span>Branch: <strong>{selectedBranch}</strong></span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Text files up to 500KB will be imported (max 200 files). Binary files are skipped.
                </p>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={!selectedRepo || importing}
              className="w-full gradient-primary"
            >
              {importing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" /> Import Repository</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
