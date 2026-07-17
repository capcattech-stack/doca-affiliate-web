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

  let targetUrl = url;

  function parseShopeeUrl(shopeeUrl) {
    const cleanUrl = shopeeUrl.split('?')[0];
    const matchProductId = cleanUrl.match(/shopee\.vn\/product\/(\d+)\/(\d+)/i);
    if (matchProductId) {
      return { shopId: matchProductId[1], itemId: matchProductId[2] };
    }
    const matchSlug = cleanUrl.match(/-i\.(\d+)\.(\d+)/i);
    if (matchSlug) {
      return { shopId: matchSlug[1], itemId: matchSlug[2] };
    }
    return null;
  }

  try {
    // Resolve link rút gọn Shopee
    if (targetUrl.toLowerCase().includes('shp.ee') || targetUrl.toLowerCase().includes('shope.ee')) {
      try {
        const redirectRes = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
        if (redirectRes.url) {
          targetUrl = redirectRes.url;
        }
      } catch (e) {
        console.error('Shopee resolve redirect error:', e.message);
      }
    }

    const isShopee = targetUrl.toLowerCase().includes('shopee.vn');
    if (isShopee) {
      const shopeeParams = parseShopeeUrl(targetUrl);
      if (shopeeParams) {
        const { shopId, itemId } = shopeeParams;
        const shopeeApiUrl = `https://shopee.vn/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
        let apiData = null;

        // Lớp 1: Gọi trực tiếp API Shopee từ Serverless
        try {
          const res = await fetch(shopeeApiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': 'https://shopee.vn/'
            }
          });
          if (res.status === 200) {
            const json = await res.json();
            if (json && json.data) {
              apiData = json.data;
            }
          }
        } catch (e) {
          console.error('Shopee API direct fetch error:', e.message);
        }

        // Lớp 2: Gọi API qua Free CORS Proxy nếu trực tiếp bị chặn
        if (!apiData) {
          try {
            const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(shopeeApiUrl)}`;
            const res = await fetch(proxyUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
              }
            });
            if (res.status === 200) {
              const json = await res.json();
              if (json && json.data) {
                apiData = json.data;
              }
            }
          } catch (e) {
            console.error('Shopee API proxy fetch error:', e.message);
          }
        }

        if (apiData) {
          const title = apiData.name || '';
          const imageId = apiData.image || (apiData.images && apiData.images[0]) || '';
          const image = imageId ? `https://down-vn.img.susercontent.com/file/${imageId}` : '';
          return response.status(200).json({ title, image });
        }
      }
    }

    const scrapeDoToken = process.env.SCRAPE_DO_TOKEN;
    const scraperApiKey = process.env.SCRAPER_API_KEY;

    let html = '';

    if (scrapeDoToken) {
      const scrapeUrl = `https://api.scrape.do?token=${scrapeDoToken}&url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(scrapeUrl);
      html = await res.text();
    } else if (scraperApiKey) {
      const scrapeUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(scrapeUrl);
      html = await res.text();
    } else {
      // Fallback: direct fetch (may be blocked by Shopee, but works for other sites)
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.7,en;q=0.3'
        }
      });
      html = await res.text();
    }

    // Hàm bóc tách nội dung thẻ meta bất kể thứ tự thuộc tính
    function getMetaContent(htmlContent, propertyName) {
      const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${propertyName}["'][^>]*>`, 'i');
      const match = htmlContent.match(regex);
      if (match) {
        const contentMatch = match[0].match(/content=["']([^"']+)["']/i);
        return contentMatch ? contentMatch[1] : null;
      }
      return null;
    }

    let title = getMetaContent(html, 'og:title');
    let image = getMetaContent(html, 'og:image');

    // Fallback sang thẻ <title> nếu không có og:title
    if (!title) {
      const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
      title = titleTagMatch ? titleTagMatch[1] : null;
    }

    // Giải mã ký tự HTML trong tiêu đề
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
