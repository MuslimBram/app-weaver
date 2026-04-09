import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PROJECT_STATUSES } from '@/lib/app-builder-constants';
import { useQuota } from '@/components/app-builder/QuotaCard';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft, Play, RefreshCw,
  FileCode, FolderTree, History, AlertTriangle, Loader2, Send, Github, Eye, Settings
} from 'lucide-react';
import FileTreeViewer from '@/components/app-builder/FileTreeViewer';
import CodeViewer from '@/components/app-builder/CodeViewer';
import BuildLogViewer from '@/components/app-builder/BuildLogViewer';
import RevisionCompare from '@/components/app-builder/RevisionCompare';
import GitHubPanel from '@/components/app-builder/GitHubPanel';
import LivePreview from '@/components/app-builder/LivePreview';
import ProjectSettings from '@/components/app-builder/ProjectSettings';
import { DeleteProjectDialog, CloneProjectButton } from '@/components/app-builder/ProjectActions';
import ExportOptions from '@/components/app-builder/ExportOptions';

interface ProjectData {
  id: string; name: string; slug: string; description: string | null;
  app_type: string; template_key: string | null; stack_key: string;
  selected_model: string; status: string; github_connected: boolean;
  github_repo_url: string | null; options: any; created_at: string; updated_at: string;
}
interface FileData { id: string; path: string; content: string; file_type: string | null; }
interface GenerationData {
  id: string; prompt: string; model_name: string; status: string;
  spec_json: any; current_stage: string | null; progress: number | null;
  error_message: string | null; created_at: string;
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canGenerate, canFollowUp, canExport } = useQuota();

  const [project, setProject] = useState<ProjectData | null>(null);
  const [files, setFiles] = useState<FileData[]>([]);
  const [generations, setGenerations] = useState<GenerationData[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    const [projRes, filesRes, genRes] = await Promise.all([
      supabase.from('app_projects').select('*').eq('id', projectId).single(),
      supabase.from('app_files').select('*').eq('project_id', projectId).order('path'),
      supabase.from('app_generations').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);
    if (projRes.data) setProject(projRes.data as any);
    if (filesRes.data) setFiles(filesRes.data as any);
    if (genRes.data) setGenerations(genRes.data as any);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  useEffect(() => {
    if (project?.status === 'draft' && generations.length === 0 && !generating) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, generations.length]);

  const handleGenerate = async () => {
    if (!project || !user) return;
    if (!canGenerate) { toast.error('Monthly generation limit reached.'); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-app', {
        body: {
          projectId: project.id, prompt: project.description,
          model: project.selected_model, template: project.template_key,
          stack: project.stack_key, appType: project.app_type,
          options: project.options, mode: 'initial',
        },
      });
      if (error) throw error;
      toast.success('Generation started!');
      pollGeneration(data.generationId);
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
      setGenerating(false);
    }
  };

  const pollGeneration = async (generationId: string) => {
    const poll = setInterval(async () => {
      const { data } = await supabase.from('app_generations').select('*').eq('id', generationId).single();
      if (data) {
        const gen = data as any;
        if (gen.status === 'completed' || gen.status === 'failed') {
          clearInterval(poll);
          setGenerating(false);
          await loadProject();
          if (gen.status === 'completed') toast.success('App generated successfully!');
          else toast.error(gen.error_message || 'Generation failed');
        }
      }
    }, 2000);
    setTimeout(() => { clearInterval(poll); setGenerating(false); }, 300000);
  };

  const handleFollowUp = async () => {
    if (!followUpPrompt.trim() || !project || !user) return;
    if (!canFollowUp) { toast.error('Monthly follow-up limit reached.'); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-app', {
        body: {
          projectId: project.id, prompt: followUpPrompt,
          model: project.selected_model, template: project.template_key,
          stack: project.stack_key, appType: project.app_type,
          options: project.options, mode: 'follow-up',
          existingFiles: files.map(f => ({ path: f.path, content: f.content })),
        },
      });
      if (error) throw error;
      setFollowUpPrompt('');
      toast.success('Follow-up generation started!');
      pollGeneration(data.generationId);
    } catch (err: any) {
      toast.error(err.message || 'Follow-up failed');
      setGenerating(false);
    }
  };

  const handleExportZip = async () => {
    if (!project || !user) return;
    if (!canExport) { toast.error('Monthly export limit reached.'); return; }
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-zip', { body: { projectId: project.id } });
      if (error) throw error;
      const link = document.createElement('a');
      link.href = `data:application/zip;base64,${data.zipBase64}`;
      link.download = `${project.slug}.zip`;
      link.click();
      await supabase.from('usage_tracking').insert({ user_id: user.id, action_type: 'zip_export', project_id: project.id });
      toast.success('ZIP exported!');
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally { setExporting(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <Button onClick={() => navigate('/app-builder')}>Back to My Apps</Button>
        </div>
      </div>
    );
  }

  const status = PROJECT_STATUSES[project.status] || PROJECT_STATUSES.draft;
  const latestGen = generations[0];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/app-builder')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={status.color}>{status.label}</Badge>
                <span className="text-sm text-muted-foreground">{project.stack_key} · {project.selected_model}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <CloneProjectButton projectId={project.id} projectName={project.name} />
            <DeleteProjectDialog projectId={project.id} projectName={project.name} />
            <Button variant="outline" onClick={handleGenerate} disabled={generating}>
              <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Generating...' : 'Regenerate'}
            </Button>
            <ExportOptions
              projectId={project.id}
              projectSlug={project.slug}
              filesCount={files.length}
              canExport={canExport}
            />
          </div>
        </div>

        {/* Generation Progress */}
        {generating && latestGen && (
          <Card className="mb-6 border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div className="flex-1">
                  <div className="font-medium">
                    {latestGen.current_stage === 'creating_spec' && 'Creating project specification...'}
                    {latestGen.current_stage === 'generating_files' && 'Generating files...'}
                    {latestGen.current_stage === 'reviewing' && 'Reviewing code...'}
                    {latestGen.current_stage === 'validating' && 'Validating build...'}
                    {(!latestGen.current_stage || latestGen.current_stage === 'pending') && 'Starting generation...'}
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 mt-2">
                    <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${latestGen.progress || 5}%` }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <Tabs defaultValue="files" className="space-y-4">
          <TabsList>
            <TabsTrigger value="files"><FileCode className="w-4 h-4 mr-2" />Files</TabsTrigger>
            <TabsTrigger value="preview"><Eye className="w-4 h-4 mr-2" />Preview</TabsTrigger>
            <TabsTrigger value="spec"><FolderTree className="w-4 h-4 mr-2" />Spec</TabsTrigger>
            <TabsTrigger value="logs"><AlertTriangle className="w-4 h-4 mr-2" />Build Logs</TabsTrigger>
            <TabsTrigger value="revisions"><History className="w-4 h-4 mr-2" />Revisions</TabsTrigger>
            <TabsTrigger value="github"><Github className="w-4 h-4 mr-2" />GitHub</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-2" />Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-4">
            {files.length === 0 ? (
              <Card className="py-16">
                <CardContent className="text-center">
                  <FileCode className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No files generated yet</h3>
                  <p className="text-muted-foreground mb-4">Files will appear here after generation</p>
                  {!generating && (
                    <Button onClick={handleGenerate} className="gradient-primary">
                      <Play className="w-4 h-4 mr-2" /> Start Generation
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-12 gap-4 h-[600px]">
                <div className="col-span-3 border rounded-lg overflow-hidden">
                  <div className="p-3 border-b bg-muted/50 font-medium text-sm">File Tree</div>
                  <ScrollArea className="h-[555px]">
                    <FileTreeViewer files={files} selectedFile={selectedFile} onSelect={setSelectedFile} />
                  </ScrollArea>
                </div>
                <div className="col-span-9 border rounded-lg overflow-hidden">
                  <div className="p-3 border-b bg-muted/50 font-medium text-sm">
                    {selectedFile ? selectedFile.path : 'Select a file'}
                  </div>
                  <ScrollArea className="h-[555px]">
                    {selectedFile ? (
                      <CodeViewer content={selectedFile.content} path={selectedFile.path} />
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">Select a file from the tree to view its content</div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            )}

            {/* Follow-up prompt */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Textarea
                    value={followUpPrompt}
                    onChange={e => setFollowUpPrompt(e.target.value)}
                    placeholder="Enter a follow-up prompt to modify the project (e.g., 'add login page', 'redesign dashboard')..."
                    rows={2}
                    className="flex-1"
                  />
                  <Button onClick={handleFollowUp} disabled={!followUpPrompt.trim() || generating} className="gradient-primary self-end">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview">
            <LivePreview files={files.map(f => ({ path: f.path, content: f.content }))} />
          </TabsContent>

          <TabsContent value="spec">
            <Card>
              <CardHeader><CardTitle>Project Specification</CardTitle></CardHeader>
              <CardContent>
                {latestGen?.spec_json ? (
                  <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm whitespace-pre-wrap max-h-[500px]">
                    {JSON.stringify(latestGen.spec_json, null, 2)}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">Specification will be generated during the first generation step.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs"><BuildLogViewer projectId={project.id} /></TabsContent>
          <TabsContent value="revisions"><RevisionCompare projectId={project.id} onRestore={loadProject} /></TabsContent>
          <TabsContent value="github">
            <GitHubPanel
              projectId={project.id} projectSlug={project.slug}
              githubConnected={project.github_connected}
              githubRepoUrl={project.github_repo_url}
              githubBranch={(project as any).github_branch}
              onUpdate={loadProject}
            />
          </TabsContent>
          <TabsContent value="settings">
            <ProjectSettings project={project} onUpdate={loadProject} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
