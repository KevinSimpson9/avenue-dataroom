// /api/jarvis - data + actions for the Command Center.
//   GET  -> { config, cards, briefing, capabilities }
//   POST { action: 'approve'|'dismiss', file } -> flips a card's status by
//          committing to the branch via the GitHub Contents API (when a token
//          is configured). Degrades gracefully when it isn't.
import { verifyJarvisSession, loadConfig, loadCards, loadLatestBriefing } from './_jarvis.js';

const GH_OWNER = process.env.GH_OWNER || 'KevinSimpson9';
const GH_REPO = process.env.GH_REPO || 'avenue-dataroom';
const GH_BRANCH = process.env.GH_BRANCH || 'claude/cool-euler-etomki';
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_PAT || '';

export default async function handler(req, res) {
  if (!verifyJarvisSession(req)) {
    return res.status(401).json({ ok: false, message: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      config: loadConfig(),
      cards: loadCards(),
      briefing: loadLatestBriefing(),
      capabilities: { writeBack: Boolean(GH_TOKEN) },
      generatedAt: new Date().toISOString(),
    });
  }

  if (req.method === 'POST') {
    const { action, file } = req.body || {};
    const next = action === 'approve' ? 'approved'
      : action === 'dismiss' ? 'dismissed'
      : null;
    if (!next || !file || !/^card-[\w-]+\.md$/.test(file)) {
      return res.status(400).json({ ok: false, message: 'Bad request' });
    }
    if (!GH_TOKEN) {
      return res.status(501).json({
        ok: false,
        message: 'Write-back not configured. Set GH_TOKEN in Vercel to enable one-tap approve, or tell Jarvis in chat.',
      });
    }
    try {
      const result = await flipCardStatus(file, next);
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e.message });
    }
  }

  return res.status(405).json({ ok: false, message: 'Method not allowed' });
}

async function gh(pathname, init = {}) {
  const r = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'jarvis-command-center',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function flipCardStatus(file, nextStatus) {
  const p = `jarvis/cards/${file}`;
  const meta = await gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${p}?ref=${GH_BRANCH}`);
  const current = Buffer.from(meta.content, 'base64').toString('utf-8');
  const updated = current.replace(/^status:\s*\w+/m, `status: ${nextStatus}`);
  if (updated === current) throw new Error('No status line found to update');
  await gh(`/repos/${GH_OWNER}/${GH_REPO}/contents/${p}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Command Center: ${file} -> ${nextStatus}`,
      content: Buffer.from(updated, 'utf-8').toString('base64'),
      sha: meta.sha,
      branch: GH_BRANCH,
    }),
  });
  return { file, status: nextStatus };
}
