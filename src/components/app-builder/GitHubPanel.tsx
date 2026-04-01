import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { GitBranch, Github, Loader2, Link2, Unlink, Plus, Upload, ExternalLink } from 'lucide-react';

interface GitHubPanelProps {
  projectId: string;
  projectSlug: string;
  githubConnected: boolean;
  githubRepoUrl: string | null;
  githubBranch: string | null;
  onUpdate: () => void;
}

export default function GitHubPanel({
  projectId, projectSlug, githubConnected, githubRepoUrl, githubBranch, onUpdate
}: GitHubPanelProps) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [repoName, setRepoName] = useState(projectSlug);
  const [isPrivate, setIsPrivate] = useState(true);
  const [pushBranch, setPushBranch] = useState(githubBranch || 'main');
  const [commitMessage, setCommitMessage] = useState('');
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [pushMode, setPushMode] = useState<'new' | 'existing'>('new');

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('github-integration', {
        body: { action: 'status' },
      });
      setConnected(data?.connected || false);
      setAccountName(data?.accountName || '');
    } catch {}
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const handleConnect = async () => {
    if (!tokenInput.trim()) { toast.error('Please enter a GitHub token'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: { action: 'connect', token: tokenInput },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setConnected(true);
      setAccountName(data.accountName);
      setShowConnect(false);
      setTokenInput('');
      toast.success(`Connected as ${data.accountName}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect');
    } finally { setLoading(false); }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke('github-integration', {
        body: { action: 'disconnect' },
      });
      setConnected(false);
      setAccountName('');
      toast.success('GitHub disconnected');
    } catch (err: any) {
      toast.error('Failed to disconnect');
    } finally { setLoading(false); }
  };

  const handleCreateRepo = async () => {
    if (!repoName.trim()) { toast.error('Repo name required'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: { action: 'create-repo', repoName, isPrivate, projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShowCreateRepo(false);
      toast.success(`Repo created: ${data.repoUrl}`);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create repo');
    } finally { setLoading(false); }
  };

  const handlePush = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('github-integration', {
        body: {
          action: 'push',
          projectId,
          branch: pushBranch,
          commitMessage: commitMessage || `Update from Pulse AI App Builder`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setShowPush(false);
      toast.success(`Pushed ${data.filesCount} files (${data.commitSha?.slice(0, 7)})`);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to push');
    } finally { setLoading(false); }
  };

  const loadRepos = async () => {
    try {
      const { data } = await supabase.functions.invoke('github-integration', {
        body: { action: 'list-repos' },
      });
      setRepos(data?.repos || []);
    } catch {}
  };

  const handleLinkExisting = async () => {
    if (!selectedRepo) return;
    const repo = repos.find(r => r.fullName === selectedRepo);
    if (!repo) return;
    setLoading(true);
    try {
      await supabase.from('app_projects').update({
        github_connected: true,
        github_repo_url: repo.url,
        github_branch: repo.defaultBranch || 'main',
      }).eq('id', projectId);
      setShowCreateRepo(false);
      toast.success(`Linked to ${repo.fullName}`);
      onUpdate();
    } catch (err: any) {
      toast.error('Failed to link repo');
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Github className="w-5 h-5" /> GitHub Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-success' : 'bg-muted-foreground/30'}`} />
            <div>
              <div className="font-medium">{connected ? `Connected as @${accountName}` : 'Not connected'}</div>
              <p className="text-xs text-muted-foreground">
                {connected ? 'GitHub Personal Access Token active' : 'Connect your GitHub account to push code'}
              </p>
            </div>
          </div>
          {connected ? (
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={loading}>
              <Unlink className="w-3 h-3 mr-1" /> Disconnect
            </Button>
          ) : (
            <Dialog open={showConnect} onOpenChange={setShowConnect}>
              <DialogTrigger asChild>
                <Button size="sm" className="gradient-primary">
                  <Link2 className="w-3 h-3 mr-1" /> Connect
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect GitHub</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Enter a GitHub Personal Access Token with <code className="bg-muted px-1 rounded">repo</code> scope.
                    You can create one at{' '}
                    <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      github.com/settings/tokens
                    </a>
                  </p>
                  <div className="space-y-2">
                    <Label>Personal Access Token</Label>
                    <Input
                      type="password"
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                    />
                  </div>
                  <Button onClick={handleConnect} disabled={loading} className="w-full">
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Connect GitHub
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Repo Status */}
        {githubRepoUrl && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div>
              <div className="font-medium flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                {githubRepoUrl.replace('https://github.com/', '')}
              </div>
              <p className="text-xs text-muted-foreground">Branch: {githubBranch || 'main'}</p>
            </div>
            <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="w-3 h-3 mr-1" /> Open
              </Button>
            </a>
          </div>
        )}

        {/* Actions */}
        {connected && (
          <div className="flex gap-2">
            {!githubRepoUrl && (
              <Dialog open={showCreateRepo} onOpenChange={(open) => { setShowCreateRepo(open); if (open) loadRepos(); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="w-3 h-3 mr-1" /> Create / Link Repo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>GitHub Repository</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Button variant={pushMode === 'new' ? 'default' : 'outline'} size="sm" onClick={() => setPushMode('new')}>Create New</Button>
                      <Button variant={pushMode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => setPushMode('existing')}>Link Existing</Button>
                    </div>

                    {pushMode === 'new' ? (
                      <>
                        <div className="space-y-2">
                          <Label>Repository Name</Label>
                          <Input value={repoName} onChange={e => setRepoName(e.target.value)} />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Private Repository</Label>
                          <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                        </div>
                        <Button onClick={handleCreateRepo} disabled={loading} className="w-full">
                          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Create Repository
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label>Select Repository</Label>
                          <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                            <SelectTrigger><SelectValue placeholder="Choose a repo..." /></SelectTrigger>
                            <SelectContent>
                              {repos.map(r => (
                                <SelectItem key={r.fullName} value={r.fullName}>
                                  {r.fullName} {r.private ? '🔒' : '🌐'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={handleLinkExisting} disabled={loading || !selectedRepo} className="w-full">
                          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Link Repository
                        </Button>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {githubRepoUrl && (
              <Dialog open={showPush} onOpenChange={setShowPush}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gradient-primary">
                    <Upload className="w-3 h-3 mr-1" /> Push to GitHub
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Push to GitHub</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Branch</Label>
                      <Input value={pushBranch} onChange={e => setPushBranch(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Commit Message</Label>
                      <Input
                        value={commitMessage}
                        onChange={e => setCommitMessage(e.target.value)}
                        placeholder="Update from Pulse AI App Builder"
                      />
                    </div>
                    <Button onClick={handlePush} disabled={loading} className="w-full gradient-primary">
                      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Push Files
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
