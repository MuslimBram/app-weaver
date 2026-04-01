import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PROJECT_STATUSES } from '@/lib/app-builder-constants';
import { Button } from '@/components/ui/button';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Sparkles, FolderOpen } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  template_key: string | null;
  stack_key: string;
  selected_model: string;
  created_at: string;
  updated_at: string;
}

export default function MyAppsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('app_projects')
        .select('*')
        .order('updated_at', { ascending: false });
      setProjects((data as Project[]) || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              My Apps
            </h1>
            <p className="text-muted-foreground mt-1">Manage your AI-generated applications</p>
          </div>
          <Button onClick={() => navigate('/app-builder/create')} className="gradient-primary">
            <Plus className="w-4 h-4 mr-2" /> Create App
          </Button>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search apps..." className="pl-10" />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <Card className="py-20">
            <CardContent className="text-center">
              <FolderOpen className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No apps yet</h3>
              <p className="text-muted-foreground mb-6">Create your first AI-powered application</p>
              <Button onClick={() => navigate('/app-builder/create')} className="gradient-primary">
                <Plus className="w-4 h-4 mr-2" /> Create Your First App
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(project => {
              const status = PROJECT_STATUSES[project.status] || PROJECT_STATUSES.draft;
              return (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/30 group"
                  onClick={() => navigate(`/app-builder/project/${project.id}`)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">{project.name}</h3>
                      <Badge className={status.color}>{status.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {project.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="bg-secondary px-2 py-1 rounded">{project.stack_key}</span>
                      <span className="bg-secondary px-2 py-1 rounded">{project.selected_model}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-3">
                      Updated {new Date(project.updated_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
