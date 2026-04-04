import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Eye, Code, FileCode, Layout, Navigation, Box, CheckCircle, AlertTriangle } from 'lucide-react';

interface FileData { path: string; content: string; }

interface PageInfo {
  name: string;
  path: string;
  filePath: string;
  components: string[];
}

interface ProjectHealth {
  score: number;
  hasPackageJson: boolean;
  hasReadme: boolean;
  hasRouter: boolean;
  hasStyles: boolean;
  pageCount: number;
  componentCount: number;
  totalFiles: number;
}

function analyzeProject(files: FileData[]): { pages: PageInfo[]; components: string[]; health: ProjectHealth } {
  const pages: PageInfo[] = [];
  const components: string[] = [];
  const paths = new Set(files.map(f => f.path));

  for (const f of files) {
    const isComponent = /\.(tsx|jsx)$/.test(f.path) && !f.path.includes('.test.');
    if (!isComponent) continue;

    const name = f.path.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || '';

    // Detect pages vs components
    const isPage = f.path.toLowerCase().includes('/pages/') ||
      f.path.toLowerCase().includes('page.') ||
      /export\s+default\s+function\s+\w*Page/i.test(f.content);

    if (isPage) {
      // Extract route path from component name
      const routePath = '/' + name.replace(/Page$/i, '').replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');

      // Find components used in this page
      const importMatches = f.content.matchAll(/import\s+(?:\w+|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g);
      const usedComponents: string[] = [];
      for (const m of importMatches) {
        const imp = m[1];
        if (imp.startsWith('.') && !imp.includes('utils') && !imp.includes('lib')) {
          usedComponents.push(imp.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || imp);
        }
      }

      pages.push({ name, path: routePath, filePath: f.path, components: usedComponents });
    } else {
      components.push(name);
    }
  }

  const health: ProjectHealth = {
    score: 0,
    hasPackageJson: paths.has('package.json'),
    hasReadme: paths.has('README.md') || paths.has('readme.md'),
    hasRouter: files.some(f => f.content.includes('BrowserRouter') || f.content.includes('createBrowserRouter')),
    hasStyles: files.some(f => f.path.endsWith('.css')),
    pageCount: pages.length,
    componentCount: components.length,
    totalFiles: files.length,
  };

  let score = 0;
  if (health.hasPackageJson) score += 20;
  if (health.hasReadme) score += 10;
  if (health.hasRouter) score += 15;
  if (health.hasStyles) score += 10;
  if (health.pageCount > 0) score += 20;
  if (health.componentCount > 0) score += 15;
  if (health.totalFiles >= 5) score += 10;
  health.score = Math.min(score, 100);

  return { pages, components, health };
}

function buildPreviewHtml(files: FileData[], pages: PageInfo[]): string {
  const indexHtml = files.find(f => f.path === 'index.html' || f.path === 'public/index.html');
  if (indexHtml) {
    let html = indexHtml.content;
    const cssFiles = files.filter(f => f.path.endsWith('.css'));
    if (cssFiles.length > 0) {
      html = html.replace('</head>', `<style>\n${cssFiles.map(f => f.content).join('\n')}\n</style>\n</head>`);
    }
    const jsFiles = files.filter(f => f.path.endsWith('.js') && !f.path.endsWith('.min.js') && !f.path.includes('node_modules'));
    if (jsFiles.length > 0) {
      html = html.replace('</body>', `<script>\n${jsFiles.map(f => f.content).join('\n')}\n</script>\n</body>`);
    }
    return html;
  }

  const pkgFile = files.find(f => f.path === 'package.json');
  const readmeFile = files.find(f => f.path.toLowerCase().includes('readme'));
  let pkgData: any = {};
  try { pkgData = pkgFile ? JSON.parse(pkgFile.content) : {}; } catch {}

  const depsList = Object.keys(pkgData.dependencies || {}).slice(0, 20)
    .map(d => `<span class="dep">${d}</span>`).join(' ');

  const pagesList = pages.length > 0
    ? pages.map(p => `<div class="page-item"><span class="page-icon">📄</span><div><strong>${p.name}</strong><span class="route">${p.path}</span>${p.components.length > 0 ? `<div class="uses">Uses: ${p.components.join(', ')}</div>` : ''}</div></div>`).join('')
    : '<p class="empty">No page components detected</p>';

  const fileTree = files.map(f => `<div class="file">${f.path.endsWith('/') ? '📁' : '📄'} ${f.path}</div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;padding:24px}
.header{text-align:center;padding:24px 0;border-bottom:1px solid #e2e8f0;margin-bottom:20px}
.header h1{font-size:24px;font-weight:700}.header p{color:#64748b;margin-top:4px;font-size:13px}
.badge{display:inline-block;background:#6366f1;color:white;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:500;margin-bottom:8px}
.section{background:white;border-radius:10px;padding:16px;margin-bottom:12px;border:1px solid #e2e8f0}
.section h2{font-size:14px;font-weight:600;margin-bottom:10px;color:#334155;display:flex;align-items:center;gap:6px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:600px){.grid{grid-template-columns:1fr}}
.dep{background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:11px;margin:2px;display:inline-block}
.page-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;margin:4px 0;font-size:12px}
.page-icon{font-size:16px;margin-top:1px}.route{color:#6366f1;font-size:11px;margin-left:6px}
.uses{color:#94a3b8;font-size:10px;margin-top:2px}.empty{color:#94a3b8;font-size:12px}
.file{padding:1px 0;font-size:11px;font-family:monospace;color:#475569}
</style></head><body>
<div class="header"><span class="badge">Pulse AI Preview</span><h1>${pkgData.name || 'Generated App'}</h1>
<p>${pkgData.description || readmeFile?.content?.split('\n')[0]?.replace(/^#\s*/,'') || 'AI-generated application'}</p></div>
<div class="grid">
<div class="section"><h2>📑 Pages (${pages.length})</h2>${pagesList}</div>
<div class="section"><h2>📦 Dependencies</h2><div style="display:flex;flex-wrap:wrap;gap:3px">${depsList || '<span class="empty">None</span>'}</div></div>
</div>
<div class="section"><h2>🗂 File Tree (${files.length} files)</h2>${fileTree}</div>
${readmeFile ? `<div class="section"><h2>📖 README</h2><pre style="white-space:pre-wrap;font-size:12px;color:#475569">${readmeFile.content.slice(0,1500)}</pre></div>` : ''}
</body></html>`;
}

export default function LivePreview({ files }: { files: FileData[] }) {
  const [previewTab, setPreviewTab] = useState<'preview' | 'structure' | 'source'>('preview');
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

  const { pages, components, health } = useMemo(() => analyzeProject(files), [files]);
  const previewHtml = useMemo(() => buildPreviewHtml(files, pages), [files, pages]);

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

  const scoreColor = health.score >= 80 ? 'text-green-600' : health.score >= 50 ? 'text-yellow-600' : 'text-red-500';

  return (
    <div className="space-y-4">
      {/* Project Health Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`text-2xl font-bold ${scoreColor}`}>{health.score}%</div>
              <div>
                <div className="text-sm font-medium">Build Readiness</div>
                <div className="text-xs text-muted-foreground">{health.totalFiles} files · {health.pageCount} pages · {health.componentCount} components</div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { ok: health.hasPackageJson, label: 'package.json' },
                { ok: health.hasReadme, label: 'README' },
                { ok: health.hasRouter, label: 'Router' },
                { ok: health.hasStyles, label: 'Styles' },
              ].map(item => (
                <Badge key={item.label} variant={item.ok ? 'default' : 'outline'} className={`text-xs ${item.ok ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'text-muted-foreground'}`}>
                  {item.ok ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Preview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Live Preview
            </CardTitle>
            <Tabs value={previewTab} onValueChange={v => setPreviewTab(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="preview" className="text-xs h-7"><Eye className="w-3 h-3 mr-1" />Preview</TabsTrigger>
                <TabsTrigger value="structure" className="text-xs h-7"><Layout className="w-3 h-3 mr-1" />Structure</TabsTrigger>
                <TabsTrigger value="source" className="text-xs h-7"><Code className="w-3 h-3 mr-1" />Source</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {previewTab === 'preview' ? (
            <div className="border rounded-lg overflow-hidden bg-white" style={{ height: 500 }}>
              <iframe srcDoc={previewHtml} className="w-full h-full border-0" sandbox="allow-scripts" title="App Preview" />
            </div>
          ) : previewTab === 'structure' ? (
            <div className="grid grid-cols-12 gap-4" style={{ minHeight: 400 }}>
              {/* Route Map */}
              <div className="col-span-5 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Navigation className="w-4 h-4" /> Routes & Pages
                </h3>
                {pages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pages detected</p>
                ) : (
                  <div className="space-y-2">
                    {pages.map(page => (
                      <button
                        key={page.filePath}
                        onClick={() => setSelectedPage(selectedPage === page.filePath ? null : page.filePath)}
                        className={`w-full text-left p-3 rounded-lg border transition-all text-sm ${
                          selectedPage === page.filePath ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{page.name}</span>
                          <Badge variant="outline" className="text-xs">{page.path}</Badge>
                        </div>
                        {page.components.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {page.components.map(c => (
                              <span key={c} className="text-xs bg-muted px-1.5 py-0.5 rounded">{c}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                
                {components.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mt-4">
                      <Box className="w-4 h-4" /> Components ({components.length})
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {components.slice(0, 20).map(c => (
                        <span key={c} className="text-xs bg-muted px-2 py-1 rounded">{c}</span>
                      ))}
                      {components.length > 20 && <span className="text-xs text-muted-foreground">+{components.length - 20} more</span>}
                    </div>
                  </>
                )}
              </div>

              {/* Selected page code */}
              <div className="col-span-7 border rounded-lg overflow-hidden">
                <div className="p-2 border-b bg-muted/50 text-xs font-medium">
                  {selectedPage || 'Select a page to view code'}
                </div>
                <ScrollArea className="h-[350px]">
                  {selectedPage ? (
                    <pre className="p-3 text-xs font-mono whitespace-pre-wrap">
                      {files.find(f => f.path === selectedPage)?.content || 'File not found'}
                    </pre>
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Click a page to preview its source code
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <pre className="p-4 text-xs font-mono bg-muted rounded-lg whitespace-pre-wrap">{previewHtml}</pre>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
