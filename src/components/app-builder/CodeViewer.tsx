const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  css: 'css', html: 'html', json: 'json', md: 'markdown',
  py: 'python', sh: 'bash', yml: 'yaml', yaml: 'yaml',
  sql: 'sql', env: 'bash', toml: 'toml',
};

export default function CodeViewer({ content, path }: { content: string; path: string }) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const _lang = LANG_MAP[ext] || 'text';

  return (
    <pre className="p-4 text-sm font-mono leading-relaxed overflow-auto">
      {content.split('\n').map((line, i) => (
        <div key={i} className="flex hover:bg-muted/30">
          <span className="w-12 pr-4 text-right text-muted-foreground/50 select-none shrink-0">{i + 1}</span>
          <span className="whitespace-pre-wrap break-all">{line}</span>
        </div>
      ))}
    </pre>
  );
}
