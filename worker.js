const README_URL = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

function dateKeyForTime(date) {
  // Returns YYYY-MM-DD key based on which "day" this time belongs to
  // A day runs from 12:00 UTC to 12:00 UTC the next day
  const d = new Date(date);
  if (d.getUTCHours() < 12) {
    // Before 12:00 UTC — belongs to previous calendar day's window
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return `listings:${d.toISOString().slice(0, 10)}`;
}

function todayKey() {
  return dateKeyForTime(new Date());
}

async function getSimplifyDetails(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return { skills: [], summary: "Could not fetch" };
  const html = await res.text();

  const skillsSection = html.match(/Required Skills<\/div>([\s\S]*?)<div class="border-b border-gray-100"><\/div>/);
  const skills = skillsSection
    ? [...skillsSection[1].matchAll(/bg-gray-50 text-secondary-400">([^<]+)<\/div>/g)].map(m => m[1].replace(/&amp;/g, "&").trim())
    : [];

  const summaryMatch = html.match(/class="mt-3 text-base font-bold text-secondary-400">Requirements([\s\S]*?)class="prose prose-sm text-left hidden"/);
  const summary = summaryMatch
    ? "Requirements" + summaryMatch[1]
        .replace(/<li[^>]*>/g, "\n• ")
        .replace(/<\/li>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace("Responsibilities", "\n\nResponsibilities")
        .replace(/<div[\s\S]*$/, "")
        .trim()
    : "Could not parse summary";

  return { skills, summary };
}

async function getWorkdayDetails(url) {
  const match = url.match(/https:\/\/([^.]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)\/job\/[^/]+\/[^_]+_(JR[^?-]+|[A-Z0-9]+-\d+)/);
  if (!match) return null;

  const [, tenant, , site, jobId] = match;
  const apiUrl = `https://${tenant}.wd1.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs/${jobId}`;

  try {
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const job = data.jobPostingInfo || data;
    const description = job.jobDescription || job.description || "";
    const clean = description
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { skills: [], summary: clean || "No description available" };
  } catch {
    return null;
  }
}

async function getJsonLdDetails(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const html = await res.text();

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (!jsonLdMatch) return null;

    const data = JSON.parse(jsonLdMatch[1]);
    if (data["@type"] !== "JobPosting") return null;

    const description = (data.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

    return { skills: [], summary: description || "No description available" };
  } catch {
    return null;
  }
}

async function getIcimsDetails(url) {
  try {
    // Append ?in_iframe=1 to get server-rendered HTML from iCIMS
    const iframeUrl = url.split("?")[0] + "?in_iframe=1";
    const res = await fetch(iframeUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // iCIMS job content is in div with id="icims_content" or class containing "iCIMS_JobDescription"
    const descMatch = html.match(/id="icims_content"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/class="[^"]*iCIMS_JobDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<div[^>]+job-description[^>]*>([\s\S]*?)<\/div>/i);

    if (!descMatch) return null;

    const clean = descMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return { skills: [], summary: clean || "No description available" };
  } catch {
    return null;
  }
}

async function getJobDetails(simplifyUrl, applyUrl) {
  if (simplifyUrl) return await getSimplifyDetails(simplifyUrl);
  if (!applyUrl) return { skills: [], summary: "No application link available" };

  if (applyUrl.includes("myworkdayjobs.com")) {
    const result = await getWorkdayDetails(applyUrl);
    if (result) return result;
  }

  // if (applyUrl.includes("icims.com")) {
  //   const result = await getIcimsDetails(applyUrl);
  //   if (result) return result;
  // }

  // const result = await getJsonLdDetails(applyUrl);
  // if (result) return result;

  return { skills: [], summary: "Could not fetch description" };
}

function extract0dJobs(markdown) {
  const jobs = [];
  const rows = [...markdown.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  let lastCompany = "";

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].trim());
    if (cells.length < 5) continue;

    const [companyCell, roleCell, locationCell, linkCell, ageCell] = cells;

    const ageMatch = ageCell.match(/^(\d+)d$/);
    if (ageMatch && parseInt(ageMatch[1]) > 0) break;

    const simplifyMatch = linkCell.match(/href="(https:\/\/simplify\.jobs\/p\/[^"?]+)/i);
    const applyMatch = linkCell.match(/href="([^"]+)"[^>]*>[\s\S]{0,200}?(?:fbjwDvo|G5Bzlx3)/i);

    if (!simplifyMatch && !applyMatch) continue;

    const isSubRole = companyCell.includes("↳");
    const nameMatch = companyCell.match(/>([^<]+)<\/(?:a|strong)>/);
    let company = "";
    if (nameMatch) { company = nameMatch[1].trim(); lastCompany = company; }
    else if (isSubRole) { company = lastCompany; }
    else { company = companyCell.replace(/<[^>]+>/g, "").trim(); lastCompany = company; }

    const role = roleCell.replace(/<[^>]+>/g, "").replace(/[🛂🇺🇸🎓🔥]/g, "").trim();
    const location = locationCell.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

    jobs.push({
      company, role, location,
      simplify_url: simplifyMatch ? simplifyMatch[1] : null,
      apply_url: applyMatch ? applyMatch[1] : null,
    });
  }

  return jobs;
}

async function fetchAndCache(env) {
  const readmeRes = await fetch(README_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!readmeRes.ok) throw new Error(`Failed to fetch README: ${readmeRes.status}`);

  const markdown = await readmeRes.text();
  const jobs = extract0dJobs(markdown);

  const results = await Promise.all(jobs.map(async job => {
    const { skills, summary } = await getJobDetails(job.simplify_url, job.apply_url);
    return { ...job, skills, summary };
  }));

  const key = todayKey();
  const output = { total: results.length, fetched_at: new Date().toISOString(), date: key.replace("listings:", ""), jobs: results };
  await env.LISTINGS_KV.put(key, JSON.stringify(output), { expirationTtl: SEVEN_DAYS_SECONDS });
  return output;
}

function isCacheFresh(isoString) {
  const now = new Date();
  const fetchedAt = new Date(isoString);

  const lastCronTime = new Date(now);
  lastCronTime.setUTCHours(12, 0, 0, 0);
  if (lastCronTime > now) {
    lastCronTime.setUTCDate(lastCronTime.getUTCDate() - 1);
  }

  return fetchedAt >= lastCronTime;
}

function mcpError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function mcpResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

const TOOL_DEFINITION = {
  name: "get_new_grad_listings",
  description: `Returns new grad job listings from the Simplify GitHub repo. Listings are cached daily at 12:00 UTC and kept for 7 days.

Parameters:
- date (optional): Specific date to retrieve in YYYY-MM-DD format. Defaults to today.
- days (optional): Number of past days to retrieve and combine (e.g. days=3 returns last 3 days). Overrides date if provided.

Examples:
- No params: today's listings
- date="2026-04-13": listings from April 13
- days=3: listings from the last 3 days combined`,
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Specific date in YYYY-MM-DD format" },
      days: { type: "number", description: "Number of past days to retrieve and combine" }
    }
  }
};

async function handleMCP(body, env) {
  if (typeof body !== "object" || body === null) return mcpError(null, -32700, "Parse error");

  const { jsonrpc, method, id } = body;
  if (jsonrpc !== "2.0") return mcpError(id, -32600, "Invalid request");

  if (method === "initialize") {
    return mcpResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "ng-listings-mcp", version: "1.0.0" },
    });
  }

  if (method === "tools/list") return mcpResult(id, { tools: [TOOL_DEFINITION] });

  if (method === "notifications/initialized") return null;

  if (method === "tools/call") {
    const toolName = body.params?.name;
    if (toolName !== "get_new_grad_listings") return mcpError(id, -32602, `Unknown tool: ${toolName}`);

    const args = body.params?.arguments || {};

    try {
      // Multi-day request
      if (args.days && args.days > 1) {
        const allJobs = [];
        const dates = [];
        for (let i = 0; i < args.days; i++) {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - i);
          const key = dateKeyForTime(d);
          const dateStr = key.replace("listings:", "");
          const cached = await env.LISTINGS_KV.get(key);
          if (cached) {
            const parsed = JSON.parse(cached);
            allJobs.push(...parsed.jobs.map(j => ({ ...j, listing_date: dateStr })));
            dates.push(dateStr);
          }
        }
        const output = { total: allJobs.length, dates_retrieved: dates, jobs: allJobs };
        return mcpResult(id, { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] });
      }

      // Specific date request
      if (args.date) {
        const key = `listings:${args.date}`;
        const cached = await env.LISTINGS_KV.get(key);
        if (!cached) return mcpResult(id, { content: [{ type: "text", text: JSON.stringify({ error: `No listings found for ${args.date}` }) }] });
        return mcpResult(id, { content: [{ type: "text", text: cached }] });
      }

      // Default: today
      const key = todayKey();
      const cached = await env.LISTINGS_KV.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (isCacheFresh(parsed.fetched_at)) {
          return mcpResult(id, { content: [{ type: "text", text: cached }] });
        }
      }
      const output = await fetchAndCache(env);
      return mcpResult(id, { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] });

    } catch (err) {
      return mcpResult(id, { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
    }
  }

  return mcpError(id, -32601, `Method not found: ${method}`);
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (env.AUTH_TOKEN && token !== env.AUTH_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }

    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), { headers: cors });
    }

    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify(mcpError(null, -32700, "Parse error")), { status: 400, headers: cors }); }

    const result = await handleMCP(body, env);
    if (result === null) return new Response(null, { status: 204, headers: cors });

    return new Response(JSON.stringify(result), { headers: cors });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(fetchAndCache(env));
  }
};
