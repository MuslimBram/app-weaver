import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { AI_MODELS, TEMPLATES, STACKS, APP_TYPES } from '@/lib/app-builder-constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, ArrowLeft, Sparkles, Check } from 'lucide-react';

export default function CreateAppPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    appType: 'web_app',
    template: '',
    stack: 'react-vite',
    model: 'auto',
    addSupabase: false,
    addAuth: false,
    addAdmin: false,
    addPayments: false,
    addPulseAI: false,
    githubOption: false,
  });

  const updateForm = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('App name is required'); return; }
    if (!form.description.trim()) { toast.error('Description/prompt is required'); return; }
    if (!user) { toast.error('Please sign in'); return; }

    setLoading(true);
    try {
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      
      const { data: project, error: projErr } = await supabase
        .from('app_projects')
        .insert({
          user_id: user.id,
          name: form.name,
          slug,
          description: form.description,
          app_type: form.appType as any,
          template_key: form.template || null,
          stack_key: form.stack,
          selected_model: form.model,
          status: 'draft' as any,
          github_connected: form.githubOption,
          options: {
            addSupabase: form.addSupabase,
            addAuth: form.addAuth,
            addAdmin: form.addAdmin,
            addPayments: form.addPayments,
            addPulseAI: form.addPulseAI,
          },
        })
        .select()
        .single();

      if (projErr) throw projErr;

      // Track usage
      await supabase.from('usage_tracking').insert({
        user_id: user.id,
        action_type: 'app_created',
        project_id: project.id,
        model_used: form.model,
      });

      toast.success('Project created! Starting generation...');
      navigate(`/app-builder/project/${project.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate('/app-builder')} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to My Apps
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            Create New App
          </h1>
          <p className="text-muted-foreground mt-2">Describe your app and let AI build it for you</p>
        </div>

        <div className="grid gap-6">
          {/* Basic Info */}
          <Card>
            <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>App Name *</Label>
                <Input value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="My Awesome App" />
              </div>
              <div className="space-y-2">
                <Label>App Description / Prompt *</Label>
                <Textarea value={form.description} onChange={e => updateForm('description', e.target.value)} placeholder="Describe your app in detail. What should it do? Who is it for? What features does it need?" rows={5} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>App Type</Label>
                  <Select value={form.appType} onValueChange={v => updateForm('appType', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APP_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>AI Model</Label>
                  <Select value={form.model} onValueChange={v => updateForm('model', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AI_MODELS.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          <div><span className="font-medium">{m.name}</span><span className="text-xs text-muted-foreground ml-2">{m.description}</span></div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template */}
          <Card>
            <CardHeader><CardTitle>Template</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => updateForm('template', form.template === t.id ? '' : t.id)}
                    className={`relative p-4 rounded-lg border-2 text-left transition-all hover:shadow-md ${
                      form.template === t.id ? 'border-primary bg-primary/5 shadow-glow' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {form.template === t.id && <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />}
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Stack */}
          <Card>
            <CardHeader><CardTitle>Technology Stack</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {STACKS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => updateForm('stack', s.id)}
                    className={`relative p-4 rounded-lg border-2 text-left transition-all hover:shadow-md ${
                      form.stack === s.id ? 'border-primary bg-primary/5 shadow-glow' : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {form.stack === s.id && <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />}
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
                    {s.recommended && <span className="text-xs text-accent font-medium">Recommended</span>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader><CardTitle>Options</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'addSupabase', label: 'Add Supabase Backend' },
                { key: 'addAuth', label: 'Add Authentication' },
                { key: 'addAdmin', label: 'Add Admin Panel' },
                { key: 'addPayments', label: 'Add Payments' },
                { key: 'addPulseAI', label: 'Add Pulse AI Integration' },
                { key: 'githubOption', label: 'Connect to GitHub' },
              ].map(opt => (
                <div key={opt.key} className="flex items-center justify-between">
                  <Label>{opt.label}</Label>
                  <Switch checked={(form as any)[opt.key]} onCheckedChange={v => updateForm(opt.key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Button onClick={handleCreate} disabled={loading} size="lg" className="w-full gradient-primary text-lg py-6">
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
            Generate App
          </Button>
        </div>
      </div>
    </div>
  );
}
