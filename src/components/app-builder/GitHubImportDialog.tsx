import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Github, Download, Loader2, FolderOpen, Link2 } from 'lucide-react';

interface GitHubImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GitHubImportDialog({ open, onOpenChange }: GitHubImportDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const checkConnection = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('github-integration', {
        body: { action: 'status' },
      });
      setConnected(data?.connected || false);
      setAccountName(data?.accountName || '');
      if (data?.connected) loadRepos();
    } catch {} finally { setLoading(false); }
  }, []);

  const loadRepos = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: { action: 'list-repos' },
      });
      if (error && !data?.tokenExpired) throw error;
      if (data?.tokenExpired) {
        setConnected(false);
        setAccountName('');
        setRepos([]);
        toast.error('GitHub token expired. Please reconnect with a new token.');
        return;
      }
      setRepos(data?.repos || []);
    } catch { toast.error('Failed to load repos'); }
  };

  useEffect(() => { if (open) checkConnection(); }, [open, checkConnection]);

  const handleConnect = async () => {
    if (!tokenInput.trim()) { toast.error('Please enter a GitHub token'); return; }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: { action: 'connect', token: tokenInput },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConnected(true);
      setAccountName(data.accountName);
      setTokenInput('');
      toast.success(`Connected as ${data.accountName}`);
      loadRepos();
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect');
    } finally { setConnecting(false); }
  };

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
    } finally { setImporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" /> Import from GitHub
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !connected ? (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <Github className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Connect your GitHub account to import repositories.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>GitHub Personal Access Token</Label>
                <Input
                  type="password"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                />
                <p className="text-xs text-muted-foreground">
                  Create a token with <code className="bg-muted px-1 rounded">repo</code> scope at{' '}
                  <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    github.com/settings/tokens
                  </a>
                </p>
              </div>
              <Button onClick={handleConnect} disabled={connecting || !tokenInput.trim()} className="w-full gradient-primary">
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                Connect & Import
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Connected as <strong>@{accountName}</strong></span>
            </div>

            <div className="space-y-2">
              <Label>Select Repository</Label>
              {repos.length === 0 ? (
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
