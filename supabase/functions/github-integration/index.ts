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

    const url = new URL(req.url);
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

    switch (action) {
      case "connect": {
        // Store GitHub PAT (Personal Access Token) securely
        const { token, accountName } = body;
        if (!token || !userId) {
          return new Response(JSON.stringify({ error: "Token and auth required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Validate token with GitHub API
        const ghResp = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}`, "User-Agent": "PulseAI-AppBuilder" },
        });
        if (!ghResp.ok) {
          return new Response(JSON.stringify({ error: "Invalid GitHub token" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const ghUser = await ghResp.json();

        // Check existing connection
        const { data: existing } = await supabase
          .from("github_connections")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (existing) {
          await supabase.from("github_connections").update({
            account_name: ghUser.login,
            encrypted_token_reference: token, // In production, encrypt this
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

        const { data: conn } = await supabase
          .from("github_connections")
          .select("encrypted_token_reference")
          .eq("user_id", userId)
          .single();

        if (!conn?.encrypted_token_reference) {
          return new Response(JSON.stringify({ error: "GitHub not connected" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ghToken = conn.encrypted_token_reference;

        // Create repo
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

        // Update project with GitHub info
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

        // Get connection
        const { data: ghConn } = await supabase
          .from("github_connections")
          .select("encrypted_token_reference")
          .eq("user_id", userId)
          .single();

        if (!ghConn?.encrypted_token_reference) {
          return new Response(JSON.stringify({ error: "GitHub not connected" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get project
        const { data: project } = await supabase
          .from("app_projects")
          .select("*")
          .eq("id", pushProjectId)
          .single();

        if (!project?.github_repo_url) {
          return new Response(JSON.stringify({ error: "No GitHub repo linked" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get files
        const { data: files } = await supabase
          .from("app_files")
          .select("path, content")
          .eq("project_id", pushProjectId);

        if (!files || files.length === 0) {
          return new Response(JSON.stringify({ error: "No files to push" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const ghToken = ghConn.encrypted_token_reference;
        const repoUrl = project.github_repo_url;
        // Extract owner/repo from URL
        const repoMatch = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
        if (!repoMatch) {
          return new Response(JSON.stringify({ error: "Invalid repo URL" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const repoFullName = repoMatch[1].replace(/\.git$/, "");
        const targetBranch = pushBranch || project.github_branch || "main";

        // Get current branch SHA
        const refResp = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/refs/heads/${targetBranch}`,
          { headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "PulseAI-AppBuilder" } }
        );

        let baseSha: string;
        if (refResp.ok) {
          const refData = await refResp.json();
          baseSha = refData.object.sha;
        } else {
          // Branch doesn't exist, get default branch
          const defaultRefResp = await fetch(
            `https://api.github.com/repos/${repoFullName}/git/refs/heads/main`,
            { headers: { Authorization: `Bearer ${ghToken}`, "User-Agent": "PulseAI-AppBuilder" } }
          );
          if (!defaultRefResp.ok) {
            return new Response(JSON.stringify({ error: "Could not find branch" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const defaultRefData = await defaultRefResp.json();
          baseSha = defaultRefData.object.sha;

          // Create new branch
          await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghToken}`,
              "Content-Type": "application/json",
              "User-Agent": "PulseAI-AppBuilder",
            },
            body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: baseSha }),
          });
        }

        // Create blobs for each file
        const tree: Array<{ path: string; mode: string; type: string; sha: string }> = [];
        for (const file of files) {
          const blobResp = await fetch(
            `https://api.github.com/repos/${repoFullName}/git/blobs`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${ghToken}`,
                "Content-Type": "application/json",
                "User-Agent": "PulseAI-AppBuilder",
              },
              body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
            }
          );
          if (!blobResp.ok) continue;
          const blobData = await blobResp.json();
          tree.push({ path: file.path, mode: "100644", type: "blob", sha: blobData.sha });
        }

        // Create tree
        const treeResp = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/trees`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghToken}`,
              "Content-Type": "application/json",
              "User-Agent": "PulseAI-AppBuilder",
            },
            body: JSON.stringify({ base_tree: baseSha, tree }),
          }
        );
        if (!treeResp.ok) {
          return new Response(JSON.stringify({ error: "Failed to create tree" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const treeData = await treeResp.json();

        // Create commit
        const commitResp = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/commits`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghToken}`,
              "Content-Type": "application/json",
              "User-Agent": "PulseAI-AppBuilder",
            },
            body: JSON.stringify({
              message: commitMessage || `Update from Pulse AI App Builder`,
              tree: treeData.sha,
              parents: [baseSha],
            }),
          }
        );
        if (!commitResp.ok) {
          return new Response(JSON.stringify({ error: "Failed to create commit" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const commitData = await commitResp.json();

        // Update ref
        await fetch(
          `https://api.github.com/repos/${repoFullName}/git/refs/heads/${targetBranch}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${ghToken}`,
              "Content-Type": "application/json",
              "User-Agent": "PulseAI-AppBuilder",
            },
            body: JSON.stringify({ sha: commitData.sha }),
          }
        );

        // Update project
        await supabase.from("app_projects").update({
          github_last_commit_sha: commitData.sha,
          github_branch: targetBranch,
          status: "github_ready",
        }).eq("id", pushProjectId);

        // Log
        await supabase.from("build_logs").insert({
          project_id: pushProjectId,
          log_type: "github",
          message: `Pushed ${files.length} files to ${repoFullName}@${targetBranch} (${commitData.sha.slice(0, 7)})`,
          level: "success",
        });

        // Track usage
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

        const { data: ghConnection } = await supabase
          .from("github_connections")
          .select("encrypted_token_reference")
          .eq("user_id", userId)
          .single();

        if (!ghConnection?.encrypted_token_reference) {
          return new Response(JSON.stringify({ error: "GitHub not connected" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const reposResp = await fetch("https://api.github.com/user/repos?sort=updated&per_page=30", {
          headers: { Authorization: `Bearer ${ghConnection.encrypted_token_reference}`, "User-Agent": "PulseAI-AppBuilder" },
        });

        if (!reposResp.ok) {
          return new Response(JSON.stringify({ error: "Failed to fetch repos" }), {
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
