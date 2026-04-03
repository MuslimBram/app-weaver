import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sparkles, FolderOpen, Plus, BarChart3, LogOut, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';

export default function AppNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
    navigate('/auth');
  };

  const links = [
    { path: '/app-builder', label: 'My Apps', icon: FolderOpen },
    { path: '/app-builder/create', label: 'Create App', icon: Plus },
    { path: '/app-builder/usage', label: 'Usage', icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => navigate('/app-builder')}
        >
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">Pulse AI Builder</span>
        </div>

        <nav className="flex items-center gap-1">
          {links.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Button
                key={path}
                variant={active ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => navigate(path)}
                className={active ? 'font-semibold' : ''}
              >
                <Icon className="w-4 h-4 mr-1.5" />
                {label}
              </Button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {user && (
            <span className="text-xs text-muted-foreground hidden sm:block max-w-[140px] truncate">
              {user.email}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
