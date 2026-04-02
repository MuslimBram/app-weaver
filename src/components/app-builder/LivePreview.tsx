import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye, Code, FileCode } from 'lucide-react';

interface FileData {
  path: string;
  content: string;
}

interface LivePreviewProps {
  files: FileData[];
}

export default function LivePreview({ files }: LivePreviewProps) {
  const [previewTab, setPreviewTab] = useState<'preview' | 'source'>('preview');

  // Build a single HTML document from the generated files
  const previewHtml = useMemo(() => {
    if (files.length === 0) return '';

    // Check for a plain index.html
    const indexHtml = files.find(f => f.path === 'index.html' || f.path === 'public/index.html');
    if (indexHtml) {
      // Inline CSS files
      let html = indexHtml.content;
      const cssFiles = files.filter(f => f.path.endsWith('.css'));
      if (cssFiles.length > 0) {
        const styleTag = `<style>\n${cssFiles.map(f => f.content).join('\n')}\n</style>`;
        html = html.replace('</head>', `${styleTag}\n</head>`);
      }
      // Inline JS files (non-module)
      const jsFiles = files.filter(f =>
        (f.path.endsWith('.js') && !f.path.endsWith('.min.js') && !f.path.includes('node_modules'))
      );
      if (jsFiles.length > 0) {
        const scriptTag = `<script>\n${jsFiles.map(f => f.content).join('\n')}\n</script>`;
        html = html.replace('</body>', `${scriptTag}\n</body>`);
      }
      return html;
    }

    // For React/component-based projects, create a summary preview
    const readmeFile = files.find(f => f.path.toLowerCase().includes('readme'));
    const pkgFile = files.find(f => f.path === 'package.json');
    const cssFiles = files.filter(f => f.path.endsWith('.css'));
    const componentFiles = files.filter(f =>
      f.path.endsWith('.tsx') || f.path.endsWith('.jsx')
    );
    const pageFiles = componentFiles.filter(f =>
      f.path.toLowerCase().includes('page') || f.path.toLowerCase().includes('/pages/')
    );

    let pkgData: any = {};
    try { pkgData = pkgFile ? JSON.parse(pkgFile.content) : {}; } catch {}

    const depsList = Object.keys(pkgData.dependencies || {}).slice(0, 20)
      .map(d => `<span style="background:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:12px;margin:2px;">${d}</span>`)
      .join(' ');

    const pagesList = pageFiles.length > 0
      ? pageFiles.map(f => {
          const name = f.path.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || f.path;
          return `<div style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;margin:4px 0;font-size:13px;">
            <span style="color:#6366f1;">📄</span> ${name} <span style="color:#94a3b8;font-size:11px;">${f.path}</span>
          </div>`;
        }).join('')
      : '<p style="color:#94a3b8;">No page components detected</p>';

    const fileTree = files.map(f =>
      `<div style="padding:2px 0;font-size:12px;font-family:monospace;color:#475569;">
        ${f.path.endsWith('/') ? '📁' : '📄'} ${f.path}
      </div>`
    ).join('');

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; }
  .header { text-align: center; padding: 32px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 24px; }
  .header h1 { font-size: 28px; font-weight: 700; color: #1e293b; }
  .header p { color: #64748b; margin-top: 8px; font-size: 14px; }
  .badge { display: inline-block; background: #6366f1; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e2e8f0; }
  .section h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #334155; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  ${cssFiles.map(f => f.content).join('\n')}
</style>
</head><body>
<div class="header">
  <span class="badge">Pulse AI Preview</span>
  <h1>${pkgData.name || 'Generated App'}</h1>
  <p>${pkgData.description || readmeFile?.content?.split('\n')[0]?.replace(/^#\s*/, '') || 'AI-generated application'}</p>
</div>
<div class="grid">
  <div class="section">
    <h2>📑 Pages (${pageFiles.length})</h2>
    ${pagesList}
  </div>
  <div class="section">
    <h2>📦 Dependencies</h2>
    <div style="display:flex;flex-wrap:wrap;gap:4px;">${depsList || '<span style="color:#94a3b8;">None</span>'}</div>
  </div>
</div>
<div class="section">
  <h2>🗂 File Tree (${files.length} files)</h2>
  ${fileTree}
</div>
${readmeFile ? `<div class="section"><h2>📖 README</h2><pre style="white-space:pre-wrap;font-size:13px;color:#475569;">${readmeFile.content.slice(0, 2000)}</pre></div>` : ''}
</body></html>`;
  }, [files]);

  if (files.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center">
          <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Generate files first to see a preview</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" /> Live Preview
          </CardTitle>
          <Tabs value={previewTab} onValueChange={v => setPreviewTab(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="preview" className="text-xs h-7"><Eye className="w-3 h-3 mr-1" />Preview</TabsTrigger>
              <TabsTrigger value="source" className="text-xs h-7"><Code className="w-3 h-3 mr-1" />Source</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {previewTab === 'preview' ? (
          <div className="border rounded-lg overflow-hidden bg-white" style={{ height: 500 }}>
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
              title="App Preview"
            />
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <pre className="p-4 text-xs font-mono bg-muted rounded-lg whitespace-pre-wrap">
              {previewHtml}
            </pre>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
