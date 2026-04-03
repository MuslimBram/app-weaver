import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AI_MODELS, STACKS, APP_TYPES } from '@/lib/app-builder-constants';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Settings } from 'lucide-react';

interface ProjectSettingsProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    app_type: string;
    stack_key: string;
    selected_model: string;
  };
  onUpdate: () => void;
}

export default function ProjectSettings({ project, onUpdate }: ProjectSettingsProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [appType, setAppType] = useState(project.app_type);
  const [stack, setStack] = useState(project.stack_key);
  const [model, setModel] = useState(project.selected_model);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_projects')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          app_type: appType as any,
          stack_key: stack,
          selected_model: model,
        })
        .eq('id', project.id);

      if (error) throw error;
      toast.success('Settings saved');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" /> Project Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Project Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>App Type</Label>
            <Select value={appType} onValueChange={setAppType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {APP_TYPES.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Stack</Label>
            <Select value={stack} onValueChange={setStack}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STACKS.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>AI Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Description / Prompt</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
        </div>

        <Button onClick={handleSave} disabled={saving} className="gradient-primary">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}
