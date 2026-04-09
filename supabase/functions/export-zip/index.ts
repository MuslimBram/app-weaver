import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple ZIP file creation using raw bytes
function createZip(files: Array<{ path: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const centralDirectory: Uint8Array[] = [];
  const fileEntries: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const fileNameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);
    
    // Local file header
    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression (store)
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    
    // CRC32
    let crc = 0xFFFFFFFF;
    for (const byte of contentBytes) {
      crc ^= byte;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    crc ^= 0xFFFFFFFF;
    view.setUint32(14, crc >>> 0, true);
    
    view.setUint32(18, contentBytes.length, true); // compressed size
    view.setUint32(22, contentBytes.length, true); // uncompressed size
    view.setUint16(26, fileNameBytes.length, true); // name length
    view.setUint16(28, 0, true); // extra length
    localHeader.set(fileNameBytes, 30);
    
    // Central directory entry
    const cdEntry = new Uint8Array(46 + fileNameBytes.length);
    const cdView = new DataView(cdEntry.buffer);
    cdView.setUint32(0, 0x02014b50, true); // signature
    cdView.setUint16(4, 20, true); // version made by
    cdView.setUint16(6, 20, true); // version needed
    cdView.setUint16(8, 0, true); // flags
    cdView.setUint16(10, 0, true); // compression
    cdView.setUint16(12, 0, true); // mod time
    cdView.setUint16(14, 0, true); // mod date
    cdView.setUint32(16, crc >>> 0, true); // crc
    cdView.setUint32(20, contentBytes.length, true); // compressed
    cdView.setUint32(24, contentBytes.length, true); // uncompressed
    cdView.setUint16(28, fileNameBytes.length, true); // name length
    cdView.setUint16(30, 0, true); // extra
    cdView.setUint16(32, 0, true); // comment
    cdView.setUint16(34, 0, true); // disk
    cdView.setUint16(36, 0, true); // internal attrs
    cdView.setUint32(38, 0, true); // external attrs
    cdView.setUint32(42, offset, true); // offset
    cdEntry.set(fileNameBytes, 46);
    
    centralDirectory.push(cdEntry);
    fileEntries.push(localHeader);
    fileEntries.push(contentBytes);
    offset += localHeader.length + contentBytes.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDirectory) cdSize += cd.length;

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true); // disk
  eocdView.setUint16(6, 0, true); // disk start
  eocdView.setUint16(8, files.length, true); // entries on disk
  eocdView.setUint16(10, files.length, true); // total entries
  eocdView.setUint32(12, cdSize, true); // cd size
  eocdView.setUint32(16, cdOffset, true); // cd offset
  eocdView.setUint16(20, 0, true); // comment length

  // Combine
  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const entry of fileEntries) {
    result.set(entry, pos);
    pos += entry.length;
  }
  for (const cd of centralDirectory) {
    result.set(cd, pos);
    pos += cd.length;
  }
  result.set(eocd, pos);

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { projectId, addPwaFiles } = await req.json();
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: files } = await supabase
      .from('app_files')
      .select('path, content')
      .eq('project_id', projectId)
      .order('path');

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: "No files found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allFiles = [...files];

    // Add PWA files if requested
    if (addPwaFiles) {
      const { data: proj } = await supabase.from('app_projects').select('name, slug').eq('id', projectId).single();
      const appName = proj?.name || 'App';
      const slug = proj?.slug || 'app';

      if (!allFiles.find(f => f.path === 'manifest.json')) {
        allFiles.push({
          path: 'manifest.json',
          content: JSON.stringify({
            name: appName,
            short_name: slug,
            start_url: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#6366f1',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          }, null, 2),
        });
      }

      if (!allFiles.find(f => f.path === 'sw.js')) {
        allFiles.push({
          path: 'sw.js',
          content: `const CACHE_NAME = '${slug}-v1';
const urlsToCache = ['/'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});`,
        });
      }

      // Add PWA registration to index.html if it exists
      const indexHtml = allFiles.find(f => f.path === 'index.html');
      if (indexHtml && !indexHtml.content.includes('manifest')) {
        indexHtml.content = indexHtml.content.replace(
          '</head>',
          '  <link rel="manifest" href="/manifest.json">\n  </head>'
        );
        indexHtml.content = indexHtml.content.replace(
          '</body>',
          `  <script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}</script>\n  </body>`
        );
      }
    }

    const zipBytes = createZip(allFiles);
    const zipBase64 = base64Encode(zipBytes);

    // Track export
    const { data: project } = await supabase
      .from('app_projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (project) {
      await supabase.from('app_exports').insert({
        project_id: projectId,
        user_id: project.user_id,
        export_type: 'zip',
      });
    }

    return new Response(JSON.stringify({ zipBase64, filesCount: files.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("export-zip error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
