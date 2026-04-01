import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Model routing map
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

    // Basic prompt moderation
    const blocked = ['drop table', 'delete from', 'exec(', 'eval(', '<script>'];
    const lowerPrompt = prompt.toLowerCase();
    for (const b of blocked) {
      if (lowerPrompt.includes(b)) {
        return new Response(JSON.stringify({ error: "Prompt contains blocked content" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const gatewayModel = MODEL_MAP[model] || MODEL_MAP['auto'];

    // Create generation record
    const { data: generation, error: genErr } = await supabase
      .from('app_generations')
      .insert({
        project_id: projectId,
        user_id: (await supabase.from('app_projects').select('user_id').eq('id', projectId).single()).data?.user_id,
        prompt,
        model_name: model,
        generation_mode: mode || 'initial',
        status: 'creating_spec',
        current_stage: 'creating_spec',
        progress: 10,
      })
      .select()
      .single();

    if (genErr) throw genErr;

    // Update project status
    await supabase.from('app_projects').update({ status: 'generating' }).eq('id', projectId);

    // Log
    await supabase.from('build_logs').insert({
      project_id: projectId,
      generation_id: generation.id,
      log_type: 'generation',
      message: `Starting ${mode || 'initial'} generation with model ${model}`,
      level: 'info',
    });

    // STEP 1: Generate spec
    const specSystemPrompt = `You are an expert app architect. Given a description, generate a detailed project specification as JSON.
Return ONLY valid JSON with this structure:
{
  "app_name": "string",
  "goal": "string",
  "target_users": "string",
  "pages": ["page1", "page2"],
  "features": ["feature1", "feature2"],
  "stack": "string",
  "file_tree": ["path/to/file1.tsx", "path/to/file2.tsx"],
  "dependencies": {"package": "version"},
  "env_vars": ["VAR1", "VAR2"],
  "integrations": ["integration1"]
}`;

    const specPrompt = `App: ${prompt}
Type: ${appType || 'web_app'}
Stack: ${stack || 'react-vite'}
Template: ${template || 'none'}
Options: ${JSON.stringify(options || {})}
${mode === 'follow-up' && existingFiles ? `\nExisting files: ${existingFiles.map((f: any) => f.path).join(', ')}` : ''}`;

    const specResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: gatewayModel,
        messages: [
          { role: "system", content: specSystemPrompt },
          { role: "user", content: specPrompt },
        ],
      }),
    });

    if (!specResponse.ok) {
      const errText = await specResponse.text();
      throw new Error(`AI gateway error: ${specResponse.status} ${errText}`);
    }

    const specData = await specResponse.json();
    let specContent = specData.choices?.[0]?.message?.content || '{}';
    
    // Clean markdown code blocks
    specContent = specContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let specJson;
    try {
      specJson = JSON.parse(specContent);
    } catch {
      specJson = { app_name: prompt.slice(0, 50), goal: prompt, pages: ['index'], file_tree: ['src/App.tsx', 'src/index.css'], features: [], stack, dependencies: {}, env_vars: [], integrations: [] };
    }

    await supabase.from('app_generations').update({
      spec_json: specJson,
      status: 'generating_files',
      current_stage: 'generating_files',
      progress: 30,
    }).eq('id', generation.id);

    await supabase.from('build_logs').insert({
      project_id: projectId,
      generation_id: generation.id,
      log_type: 'spec',
      message: `Spec generated: ${specJson.pages?.length || 0} pages, ${specJson.features?.length || 0} features`,
      level: 'success',
    });

    // STEP 2: Generate files
    const fileGenSystemPrompt = `You are an expert full-stack developer. Generate complete project files based on the specification.
Return ONLY valid JSON as an array of objects with this structure:
[
  {"path": "src/App.tsx", "content": "file content here", "type": "tsx"},
  {"path": "package.json", "content": "{...}", "type": "json"}
]
Generate real, functional code. Include:
- All necessary imports
- Proper file structure
- README.md
- package.json with dependencies
- Environment variable examples if needed
Make each file complete and ready to use.
Stack: ${stack}
${mode === 'follow-up' ? 'IMPORTANT: Only return files that need to be changed or added. Do not regenerate unchanged files.' : ''}`;

    const fileGenPrompt = `Specification: ${JSON.stringify(specJson)}
Original prompt: ${prompt}
${mode === 'follow-up' && existingFiles ? `\nExisting files:\n${existingFiles.map((f: any) => `--- ${f.path} ---\n${f.content.slice(0, 500)}`).join('\n')}` : ''}`;

    const fileResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: gatewayModel,
        messages: [
          { role: "system", content: fileGenSystemPrompt },
          { role: "user", content: fileGenPrompt },
        ],
      }),
    });

    if (!fileResponse.ok) {
      throw new Error(`File generation failed: ${fileResponse.status}`);
    }

    const fileData = await fileResponse.json();
    let fileContent = fileData.choices?.[0]?.message?.content || '[]';
    fileContent = fileContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let generatedFiles;
    try {
      generatedFiles = JSON.parse(fileContent);
    } catch {
      generatedFiles = [{ path: 'README.md', content: `# ${specJson.app_name || 'App'}\n\n${prompt}`, type: 'md' }];
    }

    if (!Array.isArray(generatedFiles)) {
      generatedFiles = [generatedFiles];
    }

    await supabase.from('app_generations').update({
      status: 'reviewing',
      current_stage: 'reviewing',
      progress: 60,
    }).eq('id', generation.id);

    // STEP 3: Review pass
    await supabase.from('build_logs').insert({
      project_id: projectId,
      generation_id: generation.id,
      log_type: 'review',
      message: `Generated ${generatedFiles.length} files. Running review pass...`,
      level: 'info',
    });

    // Basic review: check for missing imports, env vars, etc.
    const reviewIssues: string[] = [];
    for (const file of generatedFiles) {
      if (!file.path || typeof file.content !== 'string') {
        reviewIssues.push(`Invalid file entry: ${JSON.stringify(file).slice(0, 100)}`);
        continue;
      }
      if (file.path.endsWith('.tsx') || file.path.endsWith('.ts')) {
        // Check for common issues
        if (file.content.includes('import') && !file.content.includes('from')) {
          reviewIssues.push(`${file.path}: Possible broken import statement`);
        }
      }
    }

    if (reviewIssues.length > 0) {
      await supabase.from('build_logs').insert({
        project_id: projectId,
        generation_id: generation.id,
        log_type: 'review',
        message: `Review issues found:\n${reviewIssues.join('\n')}`,
        level: 'warning',
      });
    }

    // STEP 4: Validation
    await supabase.from('app_generations').update({
      status: 'validating',
      current_stage: 'validating',
      progress: 80,
    }).eq('id', generation.id);

    const validFiles = generatedFiles.filter((f: any) => f.path && typeof f.content === 'string');

    // Check package.json validity
    const pkgFile = validFiles.find((f: any) => f.path === 'package.json');
    if (pkgFile) {
      try {
        JSON.parse(pkgFile.content);
        await supabase.from('build_logs').insert({
          project_id: projectId,
          generation_id: generation.id,
          log_type: 'validation',
          message: 'package.json is valid JSON',
          level: 'success',
        });
      } catch {
        await supabase.from('build_logs').insert({
          project_id: projectId,
          generation_id: generation.id,
          log_type: 'validation',
          message: 'package.json is invalid JSON',
          level: 'error',
        });
      }
    }

    // Create revision
    const { data: existingRevisions } = await supabase
      .from('app_revisions')
      .select('revision_number')
      .eq('project_id', projectId)
      .order('revision_number', { ascending: false })
      .limit(1);

    const nextRevNum = (existingRevisions?.[0]?.revision_number || 0) + 1;

    const { data: revision } = await supabase
      .from('app_revisions')
      .insert({
        project_id: projectId,
        generation_id: generation.id,
        revision_number: nextRevNum,
        change_summary: mode === 'follow-up' ? `Follow-up: ${prompt.slice(0, 200)}` : `Initial generation: ${(specJson.app_name || prompt).slice(0, 200)}`,
        created_by: (await supabase.from('app_projects').select('user_id').eq('id', projectId).single()).data?.user_id,
      })
      .select()
      .single();

    // Store files
    if (mode === 'follow-up') {
      // For follow-ups, update existing files or add new ones
      for (const file of validFiles) {
        const { data: existing } = await supabase
          .from('app_files')
          .select('id')
          .eq('project_id', projectId)
          .eq('path', file.path)
          .single();

        if (existing) {
          await supabase.from('app_files').update({
            content: file.content,
            file_type: file.type || file.path.split('.').pop(),
            generation_id: generation.id,
            revision_id: revision?.id,
          }).eq('id', existing.id);
        } else {
          await supabase.from('app_files').insert({
            project_id: projectId,
            generation_id: generation.id,
            revision_id: revision?.id,
            path: file.path,
            content: file.content,
            file_type: file.type || file.path.split('.').pop(),
          });
        }
      }
    } else {
      // For initial generation, clear old files and insert new
      await supabase.from('app_files').delete().eq('project_id', projectId);
      
      for (const file of validFiles) {
        await supabase.from('app_files').insert({
          project_id: projectId,
          generation_id: generation.id,
          revision_id: revision?.id,
          path: file.path,
          content: file.content,
          file_type: file.type || file.path.split('.').pop(),
        });
      }
    }

    // Complete
    await supabase.from('app_generations').update({
      status: 'completed',
      current_stage: 'completed',
      progress: 100,
      build_status: 'success',
      token_usage: (specData.usage?.total_tokens || 0) + (fileData.usage?.total_tokens || 0),
    }).eq('id', generation.id);

    await supabase.from('app_projects').update({ status: 'preview_ready' }).eq('id', projectId);

    await supabase.from('build_logs').insert({
      project_id: projectId,
      generation_id: generation.id,
      log_type: 'completion',
      message: `Generation completed. ${validFiles.length} files created. Revision #${nextRevNum}.`,
      level: 'success',
    });

    // Track usage
    const userId = (await supabase.from('app_projects').select('user_id').eq('id', projectId).single()).data?.user_id;
    if (userId) {
      await supabase.from('usage_tracking').insert({
        user_id: userId,
        action_type: mode === 'follow-up' ? 'follow_up_generation' : 'initial_generation',
        project_id: projectId,
        model_used: model,
        token_count: (specData.usage?.total_tokens || 0) + (fileData.usage?.total_tokens || 0),
      });
    }

    return new Response(JSON.stringify({
      generationId: generation.id,
      revisionId: revision?.id,
      filesCount: validFiles.length,
      status: 'completed',
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("generate-app error:", e);

    // Try to update generation status to failed
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const body = await req.clone().json().catch(() => ({}));
      if (body.projectId) {
        await supabase.from('app_projects').update({ status: 'failed' }).eq('id', body.projectId);
        await supabase.from('build_logs').insert({
          project_id: body.projectId,
          log_type: 'error',
          message: e instanceof Error ? e.message : 'Unknown error',
          level: 'error',
        });
      }
    } catch {}

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
