import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser(token);
      userId = user?.id || null;
    }

    // Helper to get GitHub token
    async function getGhToken(): Promise<string | null> {
      if (!userId) return null;
      const { data } = await supabase
        .from("github_connections")
        .select("encrypted_token_reference")
        .eq("user_id", userId)
        .single();
      return data?.encrypted_token_reference || null;
    }

    switch (action) {
      case "connect": {
        const { token } = body;
        if (!token || !userId) {
          return new Response(JSON.stringify({ error: "Token and auth required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ghResp = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": "PulseAI-AppBuilder" },
        });
        if (!ghResp.ok) {
          return new Response(JSON.stringify({ error: "Invalid GitHub token" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const ghUser = await ghResp.json();

        const { data: existing } = await supabase
          .from("github_connections")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (existing) {
          await supabase.from("github_connections").update({
            account_name: ghUser.login,
            encrypted_token_reference: token,
          }).eq("id", existing.id);
        } else {
          await supabase.from("github_connections").insert({
            user_id: userId,
            provider: "github",
            account_name: ghUser.login,
            encrypted_token_reference: token,
          });
        }

        return new Response(JSON.stringify({
          success: true,
          accountName: ghUser.login,
          avatarUrl: ghUser.avatar_url,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect": {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Auth required" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await supabase.from("github_connections").delete().eq("user_id", userId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "status": {
        if (!userId) {
          return new Response(JSON.stringify({ connected: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: conn } = await supabase
          .from("github_connections")
          .select("account_name, created_at")
          .eq("user_id", userId)
          .single();

        return new Response(JSON.stringify({
          connected: !!conn,
          accountName: conn?.account_name || null,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create-repo": {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Auth required" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { repoName, isPrivate, projectId } = body;
        if (!repoName || !projectId) {
          return new Response(JSON.stringify({ error: "repoName and projectId required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ghToken = await getGhToken();
        if (!ghToken) {
          return new Response(JSON.stringify({ error: "GitHub not connected" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const createResp = await fetch("https://api.github.com/user/repos", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            "Content-Type": "application/json",
            "User-Agent": "PulseAI-AppBuilder",
          },
          body: JSON.stringify({
            name: repoName,
            private: isPrivate !== false,
            auto_init: true,
            description: "Generated by Pulse AI App Builder",
          }),
        });

        if (!createResp.ok) {
          const errData = await createResp.json();
          return new Response(JSON.stringify({ error: errData.message || "Failed to create repo" }), {
            status: createResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const repoData = await createResp.json();
        await supabase.from("app_projects").update({
          github_connected: true,
          github_repo_url: repoData.html_url,
          github_branch: repoData.default_branch || "main",
        }).eq("id", projectId);

        return new Response(JSON.stringify({
          success: true,
          repoUrl: repoData.html_url,
          fullName: repoData.full_name,
          branch: repoData.default_branch,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "push": {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Auth required" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { projectId: pushProjectId, branch: pushBranch, commitMessage } = body;
        if (!pushProjectId) {
          return new Response(JSON.stringify({ error: "projectId required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ghToken = await getGhToken();
        if (!ghToken) {
          return new Response(JSON.stringify({ error: "GitHub not connected" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: project } = await supabase
          .from("app_projects").select("*").eq("id", pushProjectId).single();

        if (!project?.github_repo_url) {
          return new Response(JSON.stringify({ error: "No GitHub repo linked" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: files } = await supabase
          .from("app_files").select("path, content").eq("project_id", pushProjectId);

        if (!files || files.length === 0) {
          return new Response(JSON.stringify({ error: "No files to push" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const repoMatch = project.github_repo_url.match(/github\.com\/([^/]+\/[^/]+)/);
        if (!repoMatch) {
          return new Response(JSON.stringify({ error: "Invalid repo URL" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const repoFullName = repoMatch[1].replace(/\.git$/, "");
        const targetBranch = pushBranch || project.github_branch || "main";

        const refResp = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/refs/heads/${targetBranch}`,
          { headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "PulseAI-AppBuilder" } }
        );

        let baseSha: string;
        if (refResp.ok) {
          baseSha = (await refResp.json()).object.sha;
        } else {
          const defaultRefResp = await fetch(
            `https://api.github.com/repos/${repoFullName}/git/refs/heads/main`,
            { headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "PulseAI-AppBuilder" } }
          );
          if (!defaultRefResp.ok) {
            return new Response(JSON.stringify({ error: "Could not find branch" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          baseSha = (await defaultRefResp.json()).object.sha;
          await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
            method: "POST",
            headers: { Authorization: `Bearer ${ghToken}`, "Content-Type": "application/json", "User-Agent": "PulseAI-AppBuilder" },
            body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: baseSha }),
          });
        }

        const tree: Array<{ path: string; mode: string; type: string; sha: string }> = [];
        for (const file of files) {
          const blobResp = await fetch(`https://api.github.com/repos/${repoFullName}/git/blobs`, {
            method: "POST",
            headers: { Authorization: `Bearer ${ghToken}`, "Content-Type": "application/json", "User-Agent": "PulseAI-AppBuilder" },
            body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
          });
          if (!blobResp.ok) continue;
          const blobData = await blobResp.json();
          tree.push({ path: file.path, mode: "100644", type: "blob", sha: blobData.sha });
        }

        const treeResp = await fetch(`https://api.github.com/repos/${repoFullName}/git/trees`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ghToken}`, "Content-Type": "application/json", "User-Agent": "PulseAI-AppBuilder" },
          body: JSON.stringify({ base_tree: baseSha, tree }),
        });
        if (!treeResp.ok) {
          return new Response(JSON.stringify({ error: "Failed to create tree" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const commitResp = await fetch(`https://api.github.com/repos/${repoFullName}/git/commits`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ghToken}`, "Content-Type": "application/json", "User-Agent": "PulseAI-AppBuilder" },
          body: JSON.stringify({
            message: commitMessage || "Update from Pulse AI App Builder",
            tree: (await treeResp.json()).sha,
            parents: [baseSha],
          }),
        });
        if (!commitResp.ok) {
          return new Response(JSON.stringify({ error: "Failed to create commit" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const commitData = await commitResp.json();

        await fetch(`https://api.github.com/repos/${repoFullName}/git/refs/heads/${targetBranch}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${ghToken}`, "Content-Type": "application/json", "User-Agent": "PulseAI-AppBuilder" },
          body: JSON.stringify({ sha: commitData.sha }),
        });

        await supabase.from("app_projects").update({
          github_last_commit_sha: commitData.sha,
          github_branch: targetBranch,
          status: "github_ready",
        }).eq("id", pushProjectId);

        await supabase.from("build_logs").insert({
          project_id: pushProjectId,
          log_type: "github",
          message: `Pushed ${files.length} files to ${repoFullName}@${targetBranch} (${commitData.sha.slice(0, 7)})`,
          level: "success",
        });

        await supabase.from("usage_tracking").insert({
          user_id: userId,
          action_type: "github_push",
          project_id: pushProjectId,
          metadata: { repo: repoFullName, branch: targetBranch, commit: commitData.sha },
        });

        return new Response(JSON.stringify({
          success: true,
          commitSha: commitData.sha,
          branch: targetBranch,
          filesCount: files.length,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list-repos": {
        if (!userId) {
          return new Response(JSON.stringify({ error: "Auth required" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ghToken = await getGhToken();
        if (!ghToken) {
          return new Response(JSON.stringify({ error: "GitHub not connected" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const reposResp = await fetch("https://api.github.com/user/repos?sort=updated&per_page=30", {
          headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "PulseAI-AppBuilder" },
        });

        if (!reposResp.ok) {
          const errBody = await reposResp.text();
          console.error("GitHub list-repos failed:", reposResp.status, errBody);
          if (reposResp.status === 401) {
            await supabase.from("github_connections").delete().eq("user_id", userId);
            return new Response(JSON.stringify({ error: "GitHub token expired. Please reconnect.", tokenExpired: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ error: `Failed to fetch repos: ${reposResp.status}` }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const repos = await reposResp.json();
        return new Response(JSON.stringify({
          repos: repos.map((r: any) => ({
            name: r.name,
            fullName: r.full_name,
            url: r.html_url,
            private: r.private,
            defaultBranch: r.default_branch,
          })),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "import-repo": {
        // Import files from a GitHub repo into a new or existing project
        if (!userId) {
          return new Response(JSON.stringify({ error: "Auth required" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { repoFullName, branch, projectId: importProjectId } = body;
        if (!repoFullName) {
          return new Response(JSON.stringify({ error: "repoFullName required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ghToken = await getGhToken();
        if (!ghToken) {
          return new Response(JSON.stringify({ error: "GitHub not connected" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const targetBranch = branch || "main";

        // Get file tree recursively
        const treeResp = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/trees/${targetBranch}?recursive=1`,
          { headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "PulseAI-AppBuilder" } }
        );

        if (!treeResp.ok) {
          return new Response(JSON.stringify({ error: "Failed to fetch repo tree" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const treeData = await treeResp.json();
        const blobs = (treeData.tree || []).filter(
          (item: any) => item.type === "blob" && item.size < 500000 // Skip files >500KB
        );

        // Determine which files to fetch (text files only)
        const textExtensions = new Set([
          'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'html', 'md',
          'yaml', 'yml', 'toml', 'env', 'txt', 'svg', 'xml', 'sh', 'bash',
          'py', 'rb', 'go', 'rs', 'java', 'vue', 'svelte', 'graphql', 'sql',
          'dockerfile', 'gitignore', 'prettierrc', 'eslintrc', 'editorconfig',
        ]);

        const filesToFetch = blobs.filter((b: any) => {
          const ext = b.path.split('.').pop()?.toLowerCase() || '';
          const name = b.path.split('/').pop()?.toLowerCase() || '';
          return textExtensions.has(ext) || [
            'readme', 'license', 'makefile', 'dockerfile', '.gitignore',
            '.env.example', '.prettierrc', '.eslintrc',
          ].includes(name);
        }).slice(0, 200); // Max 200 files

        // Fetch file contents in batches of 10
        const importedFiles: Array<{ path: string; content: string; type: string }> = [];
        for (let i = 0; i < filesToFetch.length; i += 10) {
          const batch = filesToFetch.slice(i, i + 10);
          const results = await Promise.all(
            batch.map(async (blob: any) => {
              try {
                const resp = await fetch(
                  `https://api.github.com/repos/${repoFullName}/git/blobs/${blob.sha}`,
                  { headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "PulseAI-AppBuilder", Accept: "application/vnd.github.v3+json" } }
                );
                if (!resp.ok) return null;
                const data = await resp.json();
                const content = data.encoding === "base64"
                  ? atob(data.content.replace(/\n/g, ''))
                  : data.content;
                return { path: blob.path, content, type: blob.path.split('.').pop() || 'txt' };
              } catch {
                return null;
              }
            })
          );
          importedFiles.push(...results.filter(Boolean) as any);
        }

        let targetProjectId = importProjectId;

        // If no projectId, create a new project
        if (!targetProjectId) {
          const repoName = repoFullName.split('/')[1] || 'imported-project';
          const slug = repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          const { data: newProject, error: projErr } = await supabase
            .from("app_projects")
            .insert({
              user_id: userId,
              name: repoName,
              slug: `${slug}-${Date.now().toString(36)}`,
              description: `Imported from GitHub: ${repoFullName}`,
              stack_key: 'react-vite',
              selected_model: 'auto',
              status: 'preview_ready',
              github_connected: true,
              github_repo_url: `https://github.com/${repoFullName}`,
              github_branch: targetBranch,
            })
            .select()
            .single();

          if (projErr) throw projErr;
          targetProjectId = newProject.id;
        } else {
          // Clear existing files for re-import
          await supabase.from("app_files").delete().eq("project_id", targetProjectId);
        }

        // Create revision
        const { data: existingRevisions } = await supabase
          .from('app_revisions')
          .select('revision_number')
          .eq('project_id', targetProjectId)
          .order('revision_number', { ascending: false })
          .limit(1);

        const nextRevNum = (existingRevisions?.[0]?.revision_number || 0) + 1;

        const { data: revision } = await supabase
          .from('app_revisions')
          .insert({
            project_id: targetProjectId,
            revision_number: nextRevNum,
            change_summary: `Imported from GitHub: ${repoFullName}@${targetBranch}`,
            created_by: userId,
          })
          .select()
          .single();

        // Insert files
        for (const file of importedFiles) {
          await supabase.from("app_files").insert({
            project_id: targetProjectId,
            revision_id: revision?.id,
            path: file.path,
            content: file.content,
            file_type: file.type,
          });
        }

        // Track usage
        await supabase.from("usage_tracking").insert({
          user_id: userId,
          action_type: "github_import",
          project_id: targetProjectId,
          metadata: { repo: repoFullName, branch: targetBranch, filesCount: importedFiles.length },
        });

        await supabase.from("build_logs").insert({
          project_id: targetProjectId,
          log_type: "github",
          message: `Imported ${importedFiles.length} files from ${repoFullName}@${targetBranch}`,
          level: "success",
        });

        return new Response(JSON.stringify({
          success: true,
          projectId: targetProjectId,
          filesCount: importedFiles.length,
          skipped: blobs.length - importedFiles.length,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    console.error("github-integration error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
