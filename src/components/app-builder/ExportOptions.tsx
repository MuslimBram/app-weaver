import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Monitor, Smartphone, Globe, Loader2, Check, AlertTriangle } from 'lucide-react';

interface ExportOptionsProps {
  projectId: string;
  projectSlug: string;
  filesCount: number;
  canExport: boolean;
}

interface ExportMode {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
  badge?: string;
}

export default function ExportOptions({ projectId, projectSlug, filesCount, canExport }: ExportOptionsProps) {
  const { user } = useAuth();
  const [exporting, setExporting] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  const exportModes: ExportMode[] = [
    {
      id: 'zip',
      name: 'ZIP Archive',
      description: 'Download all project files as a ZIP. Ready for local development or deployment.',
      icon: <Download className="w-6 h-6" />,
      available: true,
    },
    {
      id: 'pwa',
      name: 'PWA (Progressive Web App)',
      description: 'Adds manifest.json, service worker, and PWA icons for installable web apps.',
      icon: <Globe className="w-6 h-6" />,
      available: true,
      badge: 'New',
    },
    {
      id: 'desktop',
      name: 'Desktop (Electron)',
      description: 'Wraps the app with Electron for Windows, Mac, Linux desktop builds.',
      icon: <Monitor className="w-6 h-6" />,
      available: false,
      badge: 'Coming Soon',
    },
    {
      id: 'mobile',
      name: 'Mobile (Capacitor)',
      description: 'Wraps the app with Capacitor for iOS and Android native builds.',
      icon: <Smartphone className="w-6 h-6" />,
      available: false,
      badge: 'Coming Soon',
    },
  ];

  const handleExport = async (mode: string) => {
    if (!user || !canExport) {
      toast.error('Export limit reached for this month.');
      return;
    }
    if (filesCount === 0) {
      toast.error('No files to export. Generate the app first.');
      return;
    }

    setExporting(mode);
    try {
      if (mode === 'zip') {
        const { data, error } = await supabase.functions.invoke('export-zip', {
          body: { projectId },
        });
        if (error) throw error;
        const link = document.createElement('a');
        link.href = `data:application/zip;base64,${data.zipBase64}`;
        link.download = `${projectSlug}.zip`;
        link.click();
      } else if (mode === 'pwa') {
        // Fetch existing files, add PWA files, then export as ZIP
        const { data, error } = await supabase.functions.invoke('export-zip', {
          body: { projectId, addPwaFiles: true },
        });
        if (error) throw error;
        const link = document.createElement('a');
        link.href = `data:application/zip;base64,${data.zipBase64}`;
        link.download = `${projectSlug}-pwa.zip`;
        link.click();
      }

      await supabase.from('usage_tracking').insert({
        user_id: user.id,
        action_type: 'zip_export',
        project_id: projectId,
        metadata: { exportMode: mode },
      });

      toast.success(`${mode.toUpperCase()} exported successfully!`);
      setShowExport(false);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setShowExport(true)} disabled={filesCount === 0}>
        <Download className="w-4 h-4 mr-2" />
        Export
      </Button>

      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {exportModes.map(mode => (
              <button
                key={mode.id}
                onClick={() => mode.available && handleExport(mode.id)}
                disabled={!mode.available || exporting !== null}
                className={`flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all ${
                  mode.available
                    ? 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
                    : 'border-border/50 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className={`p-2 rounded-lg ${mode.available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {mode.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{mode.name}</span>
                    {mode.badge && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        {mode.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{mode.description}</p>
                </div>
                <div className="shrink-0 self-center">
                  {exporting === mode.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : mode.available ? (
                    <Download className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-muted-foreground/50" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
