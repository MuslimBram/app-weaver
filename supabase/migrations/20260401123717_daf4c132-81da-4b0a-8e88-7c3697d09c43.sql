
-- Create app status enum
CREATE TYPE public.app_project_status AS ENUM (
  'draft', 'generating', 'generated', 'reviewing', 'validating', 
  'preview_ready', 'export_ready', 'github_ready', 'failed'
);

-- Create app type enum
CREATE TYPE public.app_type AS ENUM (
  'web_app', 'landing_page', 'dashboard', 'ecommerce', 'portfolio', 
  'saas', 'admin_panel', 'crm', 'booking', 'knowledge_base', 'support', 'other'
);

-- Create generation status enum
CREATE TYPE public.generation_status AS ENUM (
  'pending', 'creating_spec', 'generating_files', 'reviewing', 
  'validating', 'completed', 'failed'
);

-- Create build log level enum
CREATE TYPE public.build_log_level AS ENUM ('info', 'warning', 'error', 'success');

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ APP PROJECTS ============
CREATE TABLE public.app_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  app_type public.app_type NOT NULL DEFAULT 'web_app',
  template_key TEXT,
  stack_key TEXT NOT NULL DEFAULT 'react-vite',
  selected_model TEXT NOT NULL DEFAULT 'auto',
  status public.app_project_status NOT NULL DEFAULT 'draft',
  github_connected BOOLEAN NOT NULL DEFAULT false,
  github_repo_url TEXT,
  github_branch TEXT,
  github_last_commit_sha TEXT,
  options JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects" ON public.app_projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_app_projects_updated_at
  BEFORE UPDATE ON public.app_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_app_projects_user ON public.app_projects(user_id);
CREATE INDEX idx_app_projects_status ON public.app_projects(status);

-- ============ APP GENERATIONS ============
CREATE TABLE public.app_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  model_name TEXT NOT NULL,
  generation_mode TEXT NOT NULL DEFAULT 'initial',
  status public.generation_status NOT NULL DEFAULT 'pending',
  spec_json JSONB,
  build_status TEXT DEFAULT 'pending',
  build_log TEXT,
  token_usage INTEGER,
  estimated_cost NUMERIC(10,4),
  current_stage TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own generations" ON public.app_generations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_app_generations_project ON public.app_generations(project_id);

-- ============ APP FILES ============
CREATE TABLE public.app_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.app_generations(id) ON DELETE SET NULL,
  revision_id UUID,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own files" ON public.app_files
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_projects WHERE id = app_files.project_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_projects WHERE id = app_files.project_id AND user_id = auth.uid())
  );

CREATE INDEX idx_app_files_project ON public.app_files(project_id);
CREATE INDEX idx_app_files_generation ON public.app_files(generation_id);

CREATE TRIGGER update_app_files_updated_at
  BEFORE UPDATE ON public.app_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ APP REVISIONS ============
CREATE TABLE public.app_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.app_generations(id) ON DELETE SET NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  change_summary TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own revisions" ON public.app_revisions
  FOR ALL USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE INDEX idx_app_revisions_project ON public.app_revisions(project_id);

-- ============ GITHUB CONNECTIONS ============
CREATE TABLE public.github_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  account_name TEXT,
  encrypted_token_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own github connections" ON public.github_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_github_connections_updated_at
  BEFORE UPDATE ON public.github_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ BUILD LOGS ============
CREATE TABLE public.build_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.app_generations(id) ON DELETE SET NULL,
  log_type TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  level public.build_log_level NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own build logs" ON public.build_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_projects WHERE id = build_logs.project_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_projects WHERE id = build_logs.project_id AND user_id = auth.uid())
  );

CREATE INDEX idx_build_logs_project ON public.build_logs(project_id);

-- ============ APP EXPORTS ============
CREATE TABLE public.app_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL DEFAULT 'zip',
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own exports" ON public.app_exports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ USAGE TRACKING ============
CREATE TABLE public.usage_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  project_id UUID REFERENCES public.app_projects(id) ON DELETE SET NULL,
  model_used TEXT,
  token_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage" ON public.usage_tracking
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_usage_tracking_user ON public.usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_action ON public.usage_tracking(action_type);

-- Add FK for revision_id in app_files
ALTER TABLE public.app_files 
  ADD CONSTRAINT fk_app_files_revision 
  FOREIGN KEY (revision_id) REFERENCES public.app_revisions(id) ON DELETE SET NULL;
