import { useMemo } from 'react';
import { FileCode, Folder } from 'lucide-react';

interface FileData {
  id: string;
  path: string;
  content: string;
  file_type: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: FileData;
}

function buildTree(files: FileData[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existingNode = current.find(n => n.name === part);

      if (existingNode) {
        if (isLast) {
          existingNode.file = file;
          existingNode.isDir = false;
        }
        current = existingNode.children;
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        current.push(node);
        current = node.children;
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    }).map(n => ({ ...n, children: sortNodes(n.children) }));
  };

  return sortNodes(root);
}

function TreeNodeComponent({
  node, depth, selectedFile, onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: FileData | null;
  onSelect: (file: FileData) => void;
}) {
  const isSelected = selectedFile?.id === node.file?.id;

  return (
    <div>
      <button
        onClick={() => node.file && onSelect(node.file)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-hover transition-colors text-left ${
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        disabled={node.isDir}
      >
        {node.isDir ? (
          <Folder className="w-4 h-4 text-warning shrink-0" />
        ) : (
          <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {node.children.map(child => (
        <TreeNodeComponent key={child.path} node={child} depth={depth + 1} selectedFile={selectedFile} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default function FileTreeViewer({
  files, selectedFile, onSelect,
}: {
  files: FileData[];
  selectedFile: FileData | null;
  onSelect: (file: FileData) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="py-1">
      {tree.map(node => (
        <TreeNodeComponent key={node.path} node={node} depth={0} selectedFile={selectedFile} onSelect={onSelect} />
      ))}
    </div>
  );
}
