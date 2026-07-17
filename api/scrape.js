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

  function decodeHtmlEntities(str) {
    return str.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'");
  }

  function extractMeta(html) {
    const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || 
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || 
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
                       
    let title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
    let image = imageMatch ? imageMatch[1] : '';
    
    if (title) {
      title = title.replace(/\s*\|\s*Shopee\s*Việt\s*Nam\s*$/i, '').trim();
    }
    return { title, image };
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
      const cleanShopeeUrl = targetUrl.split('?')[0];
      let htmlContent = '';
      const errorLogs = [];

      const shoperProxyUrl = process.env.SHOPER_PROXY_URL;

      // Lớp 0: Gửi yêu cầu qua GAS Proxy
      if (shoperProxyUrl) {
        try {
          const requestUrl = `${shoperProxyUrl}${shoperProxyUrl.includes('?') ? '&' : '?'}url=${encodeURIComponent(cleanShopeeUrl)}`;
          const res = await fetch(requestUrl);
          if (res.status === 200) {
            htmlContent = await res.text();
            if (!htmlContent || htmlContent.trim() === '') {
              errorLogs.push('GAS HTML empty response');
              htmlContent = '';
            }
          } else {
            errorLogs.push(`GAS HTTP Status: ${res.status}`);
          }
        } catch (e) {
          errorLogs.push('GAS exception: ' + e.message);
        }
      } else {
        errorLogs.push('Chưa cấu hình SHOPER_PROXY_URL trong .env');
      }

      // Lớp 1: Gọi trực tiếp từ serverless giả lập User-Agent của Facebook Bot
      if (!htmlContent) {
        try {
          const res = await fetch(cleanShopeeUrl, {
            headers: {
              'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'vi,en-US;q=0.7,en;q=0.3'
            }
          });
          if (res.status === 200) {
            htmlContent = await res.text();
          } else {
            errorLogs.push(`Lớp 1 HTML HTTP Status: ${res.status}`);
          }
        } catch (e) {
          errorLogs.push('Lớp 1 HTML exception: ' + e.message);
        }
      }

      // Lớp 2: Gọi qua Free CORS Proxy
      if (!htmlContent) {
        try {
          const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(cleanShopeeUrl)}`;
          const res = await fetch(proxyUrl, {
            headers: {
              'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
            }
          });
          if (res.status === 200) {
            htmlContent = await res.text();
          } else {
            errorLogs.push(`Lớp 2 HTML HTTP Status: ${res.status}`);
          }
        } catch (e) {
          errorLogs.push('Lớp 2 HTML exception: ' + e.message);
        }
      }

      // Phân tích cú pháp HTML để bóc tách tiêu đề và ảnh
      if (htmlContent) {
        const { title, image } = extractMeta(htmlContent);
        if (title && image) {
          return response.status(200).json({ title, image });
        } else {
          errorLogs.push(`Không thể bóc tách meta từ HTML (Title length: ${title.length}, Image: ${image ? 'Có' : 'Không'})`);
        }
      }

      return response.status(200).json({ error: errorLogs.join(' | '), fallback: true });
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
