export default async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const { url } = request.query;

  if (!url) {
    return response.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const scrapeDoToken = process.env.SCRAPE_DO_TOKEN;
    const scraperApiKey = process.env.SCRAPER_API_KEY;

    let html = '';

    if (scrapeDoToken) {
      const scrapeUrl = `https://api.scrape.do?token=${scrapeDoToken}&url=${encodeURIComponent(url)}`;
      const res = await fetch(scrapeUrl);
      html = await res.text();
    } else if (scraperApiKey) {
      const scrapeUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}`;
      const res = await fetch(scrapeUrl);
      html = await res.text();
    } else {
      // Fallback: direct fetch (may be blocked by Shopee, but works for other sites)
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.7,en;q=0.3'
        }
      });
      html = await res.text();
    }

    // Parse og:title / og:image
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || 
                       html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);

    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);

    let title = titleMatch ? titleMatch[1] : null;
    let image = imageMatch ? imageMatch[1] : null;

    // Decode HTML entities in title
    if (title) {
      title = title.replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g, "'");
    }

    if (!title && (html.includes('captcha') || html.includes('Unavailable') || html.includes('Cloudflare'))) {
      return response.status(200).json({ error: 'Blocked by Cloudflare/Anti-bot', fallback: true });
    }

    return response.status(200).json({ title, image });
  } catch (error) {
    return response.status(200).json({ error: error.message, fallback: true });
  }
}
