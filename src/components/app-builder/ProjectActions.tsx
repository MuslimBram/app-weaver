import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2, Copy } from 'lucide-react';

interface ProjectActionsProps {
  projectId: string;
  projectName: string;
  onDeleted?: () => void;
}

export function DeleteProjectDialog({ projectId, projectName, onDeleted }: ProjectActionsProps) {
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete in order: files → revisions → generations → build_logs → exports → project
      await supabase.from('app_files').delete().eq('project_id', projectId);
      await supabase.from('app_revisions').delete().eq('project_id', projectId);
      await supabase.from('build_logs').delete().eq('project_id', projectId);
      await supabase.from('app_exports').delete().eq('project_id', projectId);
      await supabase.from('app_generations').delete().eq('project_id', projectId);
      await supabase.from('app_projects').delete().eq('id', projectId);

      toast.success(`"${projectName}" deleted`);
      if (onDeleted) onDeleted();
      else navigate('/app-builder');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="w-4 h-4 mr-1.5" /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{projectName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the project, all generated files, revisions, and build logs.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
            {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete Project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CloneProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [cloning, setCloning] = useState(false);
  const navigate = useNavigate();

  const handleClone = async () => {
    setCloning(true);
    try {
      // Get original project
      const { data: orig } = await supabase
        .from('app_projects').select('*').eq('id', projectId).single();
      if (!orig) throw new Error('Project not found');

      // Create clone
      const { data: clone, error } = await supabase
        .from('app_projects')
        .insert({
          user_id: orig.user_id,
          name: `${orig.name} (Copy)`,
          slug: `${orig.slug}-copy-${Date.now().toString(36)}`,
          description: orig.description,
          app_type: orig.app_type,
          template_key: orig.template_key,
          stack_key: orig.stack_key,
          selected_model: orig.selected_model,
          options: orig.options,
          status: 'preview_ready',
        })
        .select()
        .single();

      if (error) throw error;

      // Clone files
      const { data: files } = await supabase
        .from('app_files').select('*').eq('project_id', projectId);

      if (files && files.length > 0) {
        for (const file of files) {
          await supabase.from('app_files').insert({
            project_id: clone.id,
            path: file.path,
            content: file.content,
            file_type: file.file_type,
          });
        }
      }

      // Create initial revision
      await supabase.from('app_revisions').insert({
        project_id: clone.id,
        revision_number: 1,
        change_summary: `Cloned from "${projectName}"`,
        created_by: orig.user_id,
      });

      toast.success(`Cloned as "${clone.name}"`);
      navigate(`/app-builder/project/${clone.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Clone failed');
    } finally {
      setCloning(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClone} disabled={cloning}>
      {cloning ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Copy className="w-4 h-4 mr-1.5" />}
      Clone
    </Button>
  );
}
