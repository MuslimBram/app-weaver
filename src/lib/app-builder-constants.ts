// AI Models available in the App Builder
export const AI_MODELS = [
  { id: 'auto', name: 'Auto', description: 'Automatic model routing based on task complexity' },
  { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', description: 'Most capable reasoning model' },
  { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', description: 'Fast and intelligent' },
  { id: 'deepseek-v3.2', name: 'DeepSeek-V3.2', description: 'Open-source powerhouse' },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro Preview', description: 'Google next-gen reasoning' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Balanced performance' },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: 'Enhanced Sonnet' },
  { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', description: 'Optimized for code generation' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Multimodal reasoning' },
  { id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash Preview', description: 'Fast and efficient' },
  { id: 'gpt-5', name: 'GPT 5', description: 'OpenAI flagship model' },
  { id: 'glm-4.7', name: 'GLM-4.7', description: 'Zhipu AI model' },
  { id: 'glm-5', name: 'GLM-5', description: 'Latest Zhipu AI model' },
] as const;

// Map our model IDs to Lovable AI gateway model IDs
export const MODEL_TO_GATEWAY: Record<string, string> = {
  'auto': 'google/gemini-3-flash-preview',
  'claude-opus-4.6': 'google/gemini-2.5-pro',
  'claude-sonnet-4.6': 'google/gemini-2.5-pro',
  'deepseek-v3.2': 'google/gemini-2.5-flash',
  'gemini-3.1-pro': 'google/gemini-3.1-pro-preview',
  'claude-sonnet-4': 'google/gemini-2.5-flash',
  'claude-sonnet-4.5': 'google/gemini-2.5-pro',
  'qwen3-coder-plus': 'google/gemini-3-flash-preview',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-3.0-flash': 'google/gemini-3-flash-preview',
  'gpt-5': 'openai/gpt-5',
  'glm-4.7': 'google/gemini-2.5-flash',
  'glm-5': 'google/gemini-2.5-pro',
};

export const TEMPLATES = [
  { id: 'landing-page', name: 'Landing Page', description: 'Marketing landing page with hero, features, CTA', icon: '🚀', defaultPages: ['index', 'about', 'contact'] },
  { id: 'business-dashboard', name: 'Business Dashboard', description: 'Analytics dashboard with charts and tables', icon: '📊', defaultPages: ['dashboard', 'analytics', 'settings'] },
  { id: 'lead-funnel', name: 'Lead Funnel', description: 'Lead capture with multi-step form', icon: '🎯', defaultPages: ['landing', 'form', 'thank-you'] },
  { id: 'booking-app', name: 'Booking App', description: 'Appointment scheduling system', icon: '📅', defaultPages: ['home', 'booking', 'confirmation', 'admin'] },
  { id: 'ecommerce-starter', name: 'Ecommerce Starter', description: 'Product catalog with cart', icon: '🛒', defaultPages: ['home', 'products', 'product-detail', 'cart', 'checkout'] },
  { id: 'crm-mini', name: 'CRM Mini App', description: 'Contact management system', icon: '👥', defaultPages: ['dashboard', 'contacts', 'deals', 'settings'] },
  { id: 'knowledge-base', name: 'Knowledge Base', description: 'Documentation and help center', icon: '📚', defaultPages: ['home', 'categories', 'article', 'search'] },
  { id: 'support-app', name: 'Customer Support App', description: 'Ticket management system', icon: '🎧', defaultPages: ['dashboard', 'tickets', 'ticket-detail', 'settings'] },
  { id: 'portfolio', name: 'Portfolio Site', description: 'Personal portfolio with projects', icon: '🎨', defaultPages: ['home', 'projects', 'about', 'contact'] },
  { id: 'admin-panel', name: 'Admin Panel', description: 'Admin interface with CRUD operations', icon: '⚙️', defaultPages: ['dashboard', 'users', 'content', 'settings'] },
] as const;

export const STACKS = [
  { id: 'react-vite', name: 'React + Vite', description: 'Modern React with Vite build tool', recommended: true },
  { id: 'react-supabase', name: 'React + Supabase', description: 'Full-stack with Supabase backend', recommended: true },
  { id: 'static-html', name: 'Static HTML/CSS/JS', description: 'Simple static website', recommended: true },
  { id: 'nextjs', name: 'Next.js', description: 'React framework with SSR', recommended: false },
  { id: 'dashboard-starter', name: 'Dashboard Starter', description: 'Pre-built dashboard layout', recommended: false },
  { id: 'landing-starter', name: 'Landing Page Starter', description: 'Optimized landing page setup', recommended: false },
] as const;

export const APP_TYPES = [
  { id: 'web_app', name: 'Web Application' },
  { id: 'landing_page', name: 'Landing Page' },
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'ecommerce', name: 'E-Commerce' },
  { id: 'portfolio', name: 'Portfolio' },
  { id: 'saas', name: 'SaaS' },
  { id: 'admin_panel', name: 'Admin Panel' },
  { id: 'crm', name: 'CRM' },
  { id: 'booking', name: 'Booking' },
  { id: 'knowledge_base', name: 'Knowledge Base' },
  { id: 'support', name: 'Customer Support' },
  { id: 'other', name: 'Other' },
] as const;

export const PROJECT_STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  generating: { label: 'Generating...', color: 'bg-info text-info-foreground' },
  generated: { label: 'Generated', color: 'bg-success text-success-foreground' },
  reviewing: { label: 'Reviewing', color: 'bg-warning text-warning-foreground' },
  validating: { label: 'Validating', color: 'bg-info text-info-foreground' },
  preview_ready: { label: 'Preview Ready', color: 'bg-success text-success-foreground' },
  export_ready: { label: 'Export Ready', color: 'bg-success text-success-foreground' },
  github_ready: { label: 'GitHub Ready', color: 'bg-accent text-accent-foreground' },
  failed: { label: 'Failed', color: 'bg-destructive text-destructive-foreground' },
};
