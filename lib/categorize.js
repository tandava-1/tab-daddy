// Category rules. First match wins, so more specific hosts come first.
// `hosts` entries match the hostname exactly or as a domain suffix
// ("google.com" matches "google.com" and "docs.google.com").
// `pathIncludes` narrows a rule to URLs whose path contains one of the strings.

const RULES = [
  {
    name: 'Email',
    color: 'red',
    hosts: ['mail.google.com', 'outlook.com', 'outlook.live.com', 'outlook.office.com',
            'mail.yahoo.com', 'mail.proton.me', 'protonmail.com', 'superhuman.com',
            'hey.com', 'zoho.com/mail', 'fastmail.com']
  },
  {
    name: 'Chat',
    color: 'green',
    hosts: ['slack.com', 'discord.com', 'teams.microsoft.com', 'web.whatsapp.com',
            'web.telegram.org', 'messenger.com', 'signal.org', 'zoom.us', 'meet.google.com']
  },
  {
    name: 'AI',
    color: 'purple',
    hosts: ['claude.ai', 'chatgpt.com', 'chat.openai.com', 'openai.com', 'gemini.google.com',
            'bard.google.com', 'perplexity.ai', 'huggingface.co', 'anthropic.com',
            'midjourney.com', 'copilot.microsoft.com', 'cursor.com', 'v0.dev']
  },
  {
    name: 'Code',
    color: 'blue',
    hosts: ['github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
            'stackexchange.com', 'developer.mozilla.org', 'npmjs.com', 'pypi.org',
            'crates.io', 'codepen.io', 'codesandbox.io', 'replit.com', 'jsfiddle.net',
            'readthedocs.io', 'devdocs.io', 'localhost', '127.0.0.1', '0.0.0.0']
  },
  {
    name: 'Cloud',
    color: 'orange',
    hosts: ['console.aws.amazon.com', 'aws.amazon.com', 'console.cloud.google.com',
            'portal.azure.com', 'vercel.com', 'netlify.com', 'cloudflare.com',
            'heroku.com', 'digitalocean.com', 'render.com', 'railway.app',
            'supabase.com', 'firebase.google.com', 'fly.io']
  },
  {
    name: 'Project',
    color: 'yellow',
    hosts: ['linear.app', 'atlassian.net', 'jira.com', 'asana.com', 'trello.com',
            'monday.com', 'clickup.com', 'shortcut.com', 'basecamp.com', 'height.app',
            'calendar.google.com']
  },
  {
    name: 'Docs',
    color: 'cyan',
    hosts: ['docs.google.com', 'drive.google.com', 'sheets.google.com', 'notion.so',
            'notion.site', 'coda.io', 'quip.com', 'dropbox.com', 'box.com',
            'onedrive.live.com', 'sharepoint.com', 'figma.com', 'miro.com',
            'airtable.com', 'obsidian.md']
  },
  {
    name: 'Video',
    color: 'pink',
    hosts: ['youtube.com', 'youtu.be', 'netflix.com', 'hulu.com', 'twitch.tv',
            'vimeo.com', 'primevideo.com', 'disneyplus.com', 'max.com', 'hotstar.com',
            'tv.apple.com', 'peacocktv.com']
  },
  {
    name: 'Music',
    color: 'pink',
    hosts: ['spotify.com', 'music.apple.com', 'soundcloud.com', 'music.youtube.com',
            'bandcamp.com', 'tidal.com', 'pandora.com']
  },
  {
    name: 'Social',
    color: 'purple',
    hosts: ['x.com', 'twitter.com', 'reddit.com', 'facebook.com', 'instagram.com',
            'linkedin.com', 'tiktok.com', 'threads.net', 'threads.com', 'mastodon.social',
            'bsky.app', 'pinterest.com', 'quora.com', 'tumblr.com']
  },
  {
    name: 'News',
    color: 'orange',
    hosts: ['news.ycombinator.com', 'nytimes.com', 'wsj.com', 'bbc.com', 'bbc.co.uk',
            'cnn.com', 'theguardian.com', 'reuters.com', 'bloomberg.com', 'ft.com',
            'theverge.com', 'techcrunch.com', 'arstechnica.com', 'wired.com',
            'economist.com', 'substack.com', 'medium.com', 'news.google.com']
  },
  {
    name: 'Shopping',
    color: 'green',
    hosts: ['amazon.com', 'amazon.in', 'amazon.co.uk', 'ebay.com', 'etsy.com',
            'walmart.com', 'target.com', 'bestbuy.com', 'aliexpress.com', 'flipkart.com',
            'shein.com', 'costco.com', 'ikea.com', 'wayfair.com']
  },
  {
    name: 'Travel',
    color: 'cyan',
    hosts: ['booking.com', 'airbnb.com', 'expedia.com', 'kayak.com', 'tripadvisor.com',
            'skyscanner.net', 'hotels.com', 'united.com', 'delta.com', 'southwest.com',
            'marriott.com', 'hilton.com', 'makemytrip.com', 'irctc.co.in']
  },
  {
    name: 'Travel',
    color: 'cyan',
    hosts: ['google.com'],
    pathIncludes: ['/travel', '/flights']
  },
  {
    name: 'Finance',
    color: 'green',
    hosts: ['chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'paypal.com',
            'stripe.com', 'robinhood.com', 'coinbase.com', 'fidelity.com', 'schwab.com',
            'vanguard.com', 'mint.com', 'wise.com', 'revolut.com', 'hdfcbank.com',
            'icicibank.com', 'zerodha.com', 'finance.yahoo.com', 'tradingview.com']
  },
  {
    name: 'Learning',
    color: 'blue',
    hosts: ['coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'duolingo.com',
            'pluralsight.com', 'skillshare.com', 'brilliant.org', 'wikipedia.org',
            'arxiv.org', 'scholar.google.com', 'jstor.org']
  },
  {
    name: 'Search',
    color: 'grey',
    hosts: ['google.com'],
    pathIncludes: ['/search']
  },
  {
    name: 'Search',
    color: 'grey',
    hosts: ['bing.com', 'duckduckgo.com', 'search.brave.com', 'ecosia.org', 'startpage.com']
  }
];

const IGNORED_SCHEMES = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'devtools:'];

export function isGroupable(tab) {
  if (!tab.url || tab.pinned) return false;
  try {
    const scheme = new URL(tab.url).protocol;
    return !IGNORED_SCHEMES.includes(scheme);
  } catch {
    return false;
  }
}

function hostMatches(hostname, pattern) {
  return hostname === pattern || hostname.endsWith('.' + pattern);
}

/** Returns { name, color } for a tab, or null when no rule applies. */
export function categorize(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const path = parsed.pathname + parsed.search;

  for (const rule of RULES) {
    if (!rule.hosts.some((h) => hostMatches(host, h))) continue;
    if (rule.pathIncludes && !rule.pathIncludes.some((p) => path.includes(p))) continue;
    return { name: rule.name, color: rule.color };
  }
  return null;
}

/** "docs.github.com" -> "github.com"; falls back to the hostname itself. */
export function siteKey(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost') return host;
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    // Handle two-part public suffixes like co.uk, com.au, co.in.
    const twoPartTld = /^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
    return parts.slice(twoPartTld ? -3 : -2).join('.');
  } catch {
    return '';
  }
}

/** "github.com" -> "Github" */
export function siteLabel(key) {
  const base = key.split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const FALLBACK_COLORS = ['blue', 'cyan', 'green', 'yellow', 'orange', 'pink', 'purple', 'red'];

export function fallbackColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}
