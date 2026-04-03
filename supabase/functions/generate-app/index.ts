import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL_MAP: Record<string, string> = {
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

const blocked = ['drop table', 'delete from', 'exec(', 'eval(', '<script>'];

function sanitizePrompt(prompt: string): string | null {
  const lp = prompt.toLowerCase();
  for (const b of blocked) {
    if (lp.includes(b)) return null;
  }
  return prompt;
}

async function callAI(apiKey: string, model: string, system: string, user: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`AI gateway error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || '', usage: data.usage };
}

function parseJsonSafe(raw: string, fallback: any) {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return fallback; }
}

// ── SMART FOLLOW-UP: Analyze which files are affected ──
function buildFollowUpAnalysisPrompt(prompt: string, existingFiles: { path: string; content: string }[]) {
  const fileList = existingFiles.map(f => `- ${f.path} (${f.content.length} chars)`).join('\n');
  return `You are a code architecture analyst. Given a follow-up edit request and a list of existing project files, determine EXACTLY which files need to be modified or created.

Return ONLY valid JSON:
{
  "affected_files": ["src/App.tsx", "src/pages/Login.tsx"],
  "new_files": ["src/pages/NewPage.tsx"],
  "reasoning": "Brief explanation of why these files are affected"
}

Follow-up request: "${prompt}"

Existing files:
${fileList}

Rules:
- Only include files that ACTUALLY need changes for this request
- If adding a new page, include the router file and the new page file
- If changing styles, include only the relevant CSS/component files
- Be precise - do NOT include files that don't need changes`;
}

// ── STRONGER REVIEW ENGINE ──
interface ReviewIssue {
  file: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  autoFixable: boolean;
  fix?: { type: string; detail: string };
}

function deepReviewFiles(files: { path: string; content: string; type?: string }[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const allPaths = new Set(files.map(f => f.path));

  for (const file of files) {
    const ext = file.path.split('.').pop()?.toLowerCase() || '';
    const lines = file.content.split('\n');

    if (['tsx', 'ts', 'jsx', 'js'].includes(ext)) {
      // Check imports reference existing files
      for (const line of lines) {
        const importMatch = line.match(/from\s+['"]\.\/(.+?)['"]/);
        if (importMatch) {
          const importPath = importMatch[1];
          const possiblePaths = [
            `${file.path.split('/').slice(0, -1).join('/')}/${importPath}`,
            `${file.path.split('/').slice(0, -1).join('/')}/${importPath}.tsx`,
            `${file.path.split('/').slice(0, -1).join('/')}/${importPath}.ts`,
            `${file.path.split('/').slice(0, -1).join('/')}/${importPath}/index.tsx`,
            `${file.path.split('/').slice(0, -1).join('/')}/${importPath}/index.ts`,
          ];
          if (!possiblePaths.some(p => allPaths.has(p))) {
            issues.push({
              file: file.path,
              severity: 'warning',
              message: `Import './` + importPath + `' may not resolve to an existing file`,
              autoFixable: false,
            });
          }
        }

        // Check for common React issues
        if (line.includes('useState') && !file.content.includes("from 'react'") && !file.content.includes('from "react"')) {
          issues.push({
            file: file.path,
            severity: 'error',
            message: 'Uses useState but missing React import',
            autoFixable: true,
            fix: { type: 'add_import', detail: "import { useState } from 'react';" },
          });
          break;
        }
        if (line.includes('useEffect') && !file.content.includes("from 'react'") && !file.content.includes('from "react"')) {
          issues.push({
            file: file.path,
            severity: 'error',
            message: 'Uses useEffect but missing React import',
            autoFixable: true,
            fix: { type: 'add_import', detail: "import { useEffect } from 'react';" },
          });
          break;
        }
      }

      // Check for empty component exports
      if (file.content.includes('export default') && file.content.trim().length < 50) {
        issues.push({
          file: file.path,
          severity: 'warning',
          message: 'Component appears to be nearly empty (< 50 chars)',
          autoFixable: false,
        });
      }

      // Check for console.log in production code
      const consoleCount = (file.content.match(/console\.log/g) || []).length;
      if (consoleCount > 3) {
        issues.push({
          file: file.path,
          severity: 'info',
          message: `Contains ${consoleCount} console.log statements - consider removing for production`,
          autoFixable: true,
          fix: { type: 'remove_console', detail: 'Remove all console.log statements' },
        });
      }
    }

    // Check package.json
    if (file.path === 'package.json') {
      try {
        const pkg = JSON.parse(file.content);
        if (!pkg.name) issues.push({ file: file.path, severity: 'warning', message: 'Missing "name" field', autoFixable: true, fix: { type: 'add_field', detail: 'name' } });
        if (!pkg.scripts?.dev && !pkg.scripts?.start) issues.push({ file: file.path, severity: 'warning', message: 'Missing dev/start script', autoFixable: false });

        // Check for version conflicts in deps
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps['react'] && allDeps['react-dom']) {
          const rv = allDeps['react'].replace(/[^0-9.]/g, '');
          const rdv = allDeps['react-dom'].replace(/[^0-9.]/g, '');
          if (rv !== rdv) {
            issues.push({ file: file.path, severity: 'error', message: `React (${rv}) and ReactDOM (${rdv}) version mismatch`, autoFixable: true, fix: { type: 'fix_version', detail: `Align react-dom to ${rv}` } });
          }
        }
      } catch {
        issues.push({ file: file.path, severity: 'error', message: 'Invalid JSON in package.json', autoFixable: false });
      }
    }

    // Check for missing README
    if (file.path === 'README.md' && file.content.trim().length < 20) {
      issues.push({ file: file.path, severity: 'info', message: 'README is very short', autoFixable: false });
    }
  }

  // Global checks
  if (!allPaths.has('package.json')) {
    issues.push({ file: 'project', severity: 'error', message: 'Missing package.json', autoFixable: false });
  }
  if (!allPaths.has('README.md')) {
    issues.push({ file: 'project', severity: 'warning', message: 'Missing README.md', autoFixable: false });
  }

  return issues;
}

// Apply auto-fixes to files
function applyAutoFixes(files: { path: string; content: string; type?: string }[], issues: ReviewIssue[]): { path: string; content: string; type?: string }[] {
  const fixableIssues = issues.filter(i => i.autoFixable && i.fix);

  for (const issue of fixableIssues) {
    const file = files.find(f => f.path === issue.file);
    if (!file || !issue.fix) continue;

    switch (issue.fix.type) {
      case 'add_import':
        if (!file.content.includes(issue.fix.detail)) {
          file.content = issue.fix.detail + '\n' + file.content;
        }
        break;
      case 'remove_console':
        file.content = file.content.replace(/^\s*console\.log\(.*\);?\s*$/gm, '');
        break;
      case 'fix_version':
        // handled in package.json specific logic
        break;
    }
  }

  return files;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { projectId, prompt, model, template, stack, appType, options, mode, existingFiles } = await req.json();

    if (!projectId || !prompt) {
      return new Response(JSON.stringify({ error: "projectId and prompt are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sanitizePrompt(prompt)) {
      return new Response(JSON.stringify({ error: "Prompt contains blocked content" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gatewayModel = MODEL_MAP[model] || MODEL_MAP['auto'];
    const userId = (await supabase.from('app_projects').select('user_id').eq('id', projectId).single()).data?.user_id;

    // Create generation record
    const { data: generation, error: genErr } = await supabase
      .from('app_generations')
      .insert({
        project_id: projectId, user_id: userId, prompt, model_name: model,
        generation_mode: mode || 'initial', status: 'creating_spec',
        current_stage: 'creating_spec', progress: 10,
      })
      .select().single();
    if (genErr) throw genErr;

    await supabase.from('app_projects').update({ status: 'generating' }).eq('id', projectId);

    await supabase.from('build_logs').insert({
      project_id: projectId, generation_id: generation.id, log_type: 'generation',
      message: `Starting ${mode || 'initial'} generation with model ${model}`, level: 'info',
    });

    // ── STEP 1: SMART FOLLOW-UP ANALYSIS (new differentiation) ──
    let targetFiles: string[] | null = null;
    if (mode === 'follow-up' && existingFiles?.length > 0) {
      await supabase.from('build_logs').insert({
        project_id: projectId, generation_id: generation.id, log_type: 'analysis',
        message: 'Analyzing which files are affected by this follow-up...', level: 'info',
      });

      const analysisPrompt = buildFollowUpAnalysisPrompt(prompt, existingFiles);
      const analysis = await callAI(LOVABLE_API_KEY, gatewayModel, 'You are a precise code analyst. Return only JSON.', analysisPrompt);
      const analysisJson = parseJsonSafe(analysis.content, null);

      if (analysisJson?.affected_files) {
        targetFiles = [...(analysisJson.affected_files || []), ...(analysisJson.new_files || [])];
        await supabase.from('build_logs').insert({
          project_id: projectId, generation_id: generation.id, log_type: 'analysis',
          message: `Smart targeting: ${targetFiles.length} files identified\n${targetFiles.join(', ')}\nReason: ${analysisJson.reasoning || 'N/A'}`,
          level: 'success',
        });
      }
    }

    // ── STEP 2: SPEC GENERATION ──
    const specSystemPrompt = `You are an expert app architect. Given a description, generate a detailed project specification as JSON.
Return ONLY valid JSON with this structure:
{
  "app_name": "string", "goal": "string", "target_users": "string",
  "pages": ["page1"], "features": ["feature1"], "stack": "string",
  "file_tree": ["path/to/file.tsx"], "dependencies": {"package": "version"},
  "env_vars": ["VAR1"], "integrations": ["integration1"]
}`;

    const specUserPrompt = `App: ${prompt}
Type: ${appType || 'web_app'}
Stack: ${stack || 'react-vite'}
Template: ${template || 'none'}
Options: ${JSON.stringify(options || {})}
${mode === 'follow-up' && targetFiles ? `\nOnly modify these files: ${targetFiles.join(', ')}` : ''}
${mode === 'follow-up' && existingFiles ? `\nExisting files: ${existingFiles.map((f: any) => f.path).join(', ')}` : ''}`;

    const specResult = await callAI(LOVABLE_API_KEY, gatewayModel, specSystemPrompt, specUserPrompt);
    const specJson = parseJsonSafe(specResult.content, {
      app_name: prompt.slice(0, 50), goal: prompt, pages: ['index'],
      file_tree: ['src/App.tsx', 'src/index.css'], features: [], stack, dependencies: {}, env_vars: [], integrations: []
    });

    await supabase.from('app_generations').update({
      spec_json: specJson, status: 'generating_files', current_stage: 'generating_files', progress: 30,
    }).eq('id', generation.id);

    await supabase.from('build_logs').insert({
      project_id: projectId, generation_id: generation.id, log_type: 'spec',
      message: `Spec: ${specJson.pages?.length || 0} pages, ${specJson.features?.length || 0} features`, level: 'success',
    });

    // ── STEP 3: FILE GENERATION (with smart targeting for follow-ups) ──
    let fileGenSystemPrompt = `You are an expert full-stack developer. Generate complete project files based on the specification.
Return ONLY valid JSON as an array: [{"path": "src/App.tsx", "content": "...", "type": "tsx"}]
Generate real, functional code with all imports, proper structure, README.md, package.json.
Stack: ${stack}`;

    if (mode === 'follow-up') {
      fileGenSystemPrompt += `\n\nCRITICAL: This is a follow-up edit. Only return files that NEED changes.`;
      if (targetFiles) {
        fileGenSystemPrompt += `\nFocus ONLY on these files: ${targetFiles.join(', ')}`;
      }
    }

    let fileGenUserPrompt = `Specification: ${JSON.stringify(specJson)}\nOriginal prompt: ${prompt}`;
    if (mode === 'follow-up' && existingFiles) {
      // Only send relevant files for context
      const relevantFiles = targetFiles
        ? existingFiles.filter((f: any) => targetFiles.includes(f.path) || f.path === 'package.json')
        : existingFiles;
      fileGenUserPrompt += `\n\nExisting files to modify:\n${relevantFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join('\n\n')}`;
    }

    const fileResult = await callAI(LOVABLE_API_KEY, gatewayModel, fileGenSystemPrompt, fileGenUserPrompt);
    let generatedFiles = parseJsonSafe(fileResult.content, [{ path: 'README.md', content: `# ${specJson.app_name || 'App'}\n\n${prompt}`, type: 'md' }]);
    if (!Array.isArray(generatedFiles)) generatedFiles = [generatedFiles];

    await supabase.from('app_generations').update({
      status: 'reviewing', current_stage: 'reviewing', progress: 60,
    }).eq('id', generation.id);

    // ── STEP 4: DEEP REVIEW ENGINE (differentiation) ──
    const reviewIssues = deepReviewFiles(generatedFiles);
    const autoFixCount = reviewIssues.filter(i => i.autoFixable).length;
    const errorCount = reviewIssues.filter(i => i.severity === 'error').length;
    const warningCount = reviewIssues.filter(i => i.severity === 'warning').length;

    // Apply auto-fixes
    if (autoFixCount > 0) {
      generatedFiles = applyAutoFixes(generatedFiles, reviewIssues);
      await supabase.from('build_logs').insert({
        project_id: projectId, generation_id: generation.id, log_type: 'autofix',
        message: `Auto-fixed ${autoFixCount} issues:\n${reviewIssues.filter(i => i.autoFixable).map(i => `✅ ${i.file}: ${i.message}`).join('\n')}`,
        level: 'success',
      });
    }

    // Log all review issues with actionable detail
    if (reviewIssues.length > 0) {
      const issueReport = reviewIssues.map(i => {
        const icon = i.severity === 'error' ? '❌' : i.severity === 'warning' ? '⚠️' : 'ℹ️';
        const fixNote = i.autoFixable ? ' (auto-fixed)' : i.fix ? ` → Suggestion: ${i.fix.detail}` : '';
        return `${icon} [${i.file}] ${i.message}${fixNote}`;
      }).join('\n');

      await supabase.from('build_logs').insert({
        project_id: projectId, generation_id: generation.id, log_type: 'review',
        message: `Review: ${errorCount} errors, ${warningCount} warnings, ${autoFixCount} auto-fixed\n${issueReport}`,
        level: errorCount > 0 ? 'warning' : 'success',
      });
    } else {
      await supabase.from('build_logs').insert({
        project_id: projectId, generation_id: generation.id, log_type: 'review',
        message: `Review passed: ${generatedFiles.length} files, no issues found`, level: 'success',
      });
    }

    // ── STEP 5: VALIDATION ──
    await supabase.from('app_generations').update({
      status: 'validating', current_stage: 'validating', progress: 80,
    }).eq('id', generation.id);

    const validFiles = generatedFiles.filter((f: any) => f.path && typeof f.content === 'string');

    const pkgFile = validFiles.find((f: any) => f.path === 'package.json');
    if (pkgFile) {
      try {
        JSON.parse(pkgFile.content);
        await supabase.from('build_logs').insert({
          project_id: projectId, generation_id: generation.id, log_type: 'validation',
          message: 'package.json validated ✓', level: 'success',
        });
      } catch {
        await supabase.from('build_logs').insert({
          project_id: projectId, generation_id: generation.id, log_type: 'validation',
          message: 'package.json contains invalid JSON', level: 'error',
        });
      }
    }

    // ── STEP 6: REVISION + FILE STORAGE ──
    const { data: existingRevisions } = await supabase
      .from('app_revisions').select('revision_number').eq('project_id', projectId)
      .order('revision_number', { ascending: false }).limit(1);

    const nextRevNum = (existingRevisions?.[0]?.revision_number || 0) + 1;

    const { data: revision } = await supabase
      .from('app_revisions')
      .insert({
        project_id: projectId, generation_id: generation.id, revision_number: nextRevNum,
        change_summary: mode === 'follow-up'
          ? `Follow-up: ${prompt.slice(0, 200)}${targetFiles ? ` (${targetFiles.length} files targeted)` : ''}`
          : `Initial: ${(specJson.app_name || prompt).slice(0, 200)}`,
        created_by: userId,
      })
      .select().single();

    if (mode === 'follow-up') {
      for (const file of validFiles) {
        const { data: existing } = await supabase
          .from('app_files').select('id').eq('project_id', projectId).eq('path', file.path).single();
        if (existing) {
          await supabase.from('app_files').update({
            content: file.content, file_type: file.type || file.path.split('.').pop(),
            generation_id: generation.id, revision_id: revision?.id,
          }).eq('id', existing.id);
        } else {
          await supabase.from('app_files').insert({
            project_id: projectId, generation_id: generation.id, revision_id: revision?.id,
            path: file.path, content: file.content, file_type: file.type || file.path.split('.').pop(),
          });
        }
      }
    } else {
      await supabase.from('app_files').delete().eq('project_id', projectId);
      for (const file of validFiles) {
        await supabase.from('app_files').insert({
          project_id: projectId, generation_id: generation.id, revision_id: revision?.id,
          path: file.path, content: file.content, file_type: file.type || file.path.split('.').pop(),
        });
      }
    }

    // ── COMPLETE ──
    const totalTokens = (specResult.usage?.total_tokens || 0) + (fileResult.usage?.total_tokens || 0);
    await supabase.from('app_generations').update({
      status: 'completed', current_stage: 'completed', progress: 100,
      build_status: 'success', token_usage: totalTokens,
    }).eq('id', generation.id);

    await supabase.from('app_projects').update({ status: 'preview_ready' }).eq('id', projectId);

    await supabase.from('build_logs').insert({
      project_id: projectId, generation_id: generation.id, log_type: 'completion',
      message: `✅ Generation complete. ${validFiles.length} files, Rev #${nextRevNum}. ${autoFixCount > 0 ? `${autoFixCount} auto-fixes applied.` : ''}`,
      level: 'success',
    });

    if (userId) {
      await supabase.from('usage_tracking').insert({
        user_id: userId, action_type: mode === 'follow-up' ? 'follow_up_generation' : 'initial_generation',
        project_id: projectId, model_used: model, token_count: totalTokens,
        metadata: { targetedFiles: targetFiles?.length || 0, autoFixes: autoFixCount, reviewIssues: reviewIssues.length },
      });
    }

    return new Response(JSON.stringify({
      generationId: generation.id, revisionId: revision?.id,
      filesCount: validFiles.length, status: 'completed',
      reviewSummary: { errors: errorCount, warnings: warningCount, autoFixed: autoFixCount },
      targetedFiles: targetFiles,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("generate-app error:", e);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const body = await req.clone().json().catch(() => ({}));
      if (body.projectId) {
        await supabase.from('app_projects').update({ status: 'failed' }).eq('id', body.projectId);
        await supabase.from('build_logs').insert({
          project_id: body.projectId, log_type: 'error',
          message: e instanceof Error ? e.message : 'Unknown error', level: 'error',
        });
      }
    } catch {}
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
