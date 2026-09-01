export const prerender = false;
import type { APIRoute } from 'astro';
import crypto from 'node:crypto';

// Decode HTML entities
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Bóc tách Open Graph Meta Tags
function extractMeta(html: string): { title: string; image: string } {
  const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

  let title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
  let image = imageMatch ? imageMatch[1] : '';

  if (!title) {
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
    title = titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]) : '';
  }

  if (title) {
    title = title.replace(/\s*\|\s*Shopee\s*Việt\s*Nam\s*$/i, '').trim();
  }

  return { title, image };
}

// Trích xuất Shop ID và Item ID từ URL Shopee
function extractShopAndItemId(url: string): { shopId: string | null; itemId: string | null; slug: string | null } {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    // Pattern 1: ...-i.12345.67890
    const matchI = pathname.match(/(?:-i|\.i)\.(\d+)\.(\d+)/);
    if (matchI) {
      const slugMatch = pathname.match(/\/([^/]+)-i\.\d+\.\d+/);
      return {
        shopId: matchI[1],
        itemId: matchI[2],
        slug: slugMatch ? slugMatch[1] : null
      };
    }

    // Pattern 2: /product/12345/67890 hoặc /opaanlp/12345/67890 hoặc /{shop_name}/12345/67890
    const matchTwoNumbers = pathname.match(/\/([^/]+)\/(\d+)\/(\d+)/);
    if (matchTwoNumbers) {
      const prefix = matchTwoNumbers[1];
      const isSystemPrefix = prefix === 'product' || prefix === 'opaanlp' || prefix === 'universal-link';
      return {
        shopId: matchTwoNumbers[2],
        itemId: matchTwoNumbers[3],
        slug: isSystemPrefix ? null : prefix
      };
    }

    // Pattern 3: query params
    const shopIdParam = parsed.searchParams.get('shop_id') || parsed.searchParams.get('shopid');
    const itemIdParam = parsed.searchParams.get('item_id') || parsed.searchParams.get('itemid');
    if (shopIdParam && itemIdParam) {
      return {
        shopId: shopIdParam,
        itemId: itemIdParam,
        slug: null
      };
    }
  } catch {
    // Ignore URL parse error
  }
  return { shopId: null, itemId: null, slug: null };
}

// Fallback tiêu đề từ slug đường dẫn nếu không cào được HTML
function getFallbackTitleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const cleanPath = pathname.replace(/-i\.\d+\.\d+.*$/, '').replace(/^\//, '');
    if (cleanPath && cleanPath !== 'product' && !cleanPath.startsWith('universal-link')) {
      return cleanPath
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  } catch {
    // Ignore
  }
  return 'Sản phẩm đề xuất từ Shopee';
}

// Gọi Shopee Open API GraphQL nếu có App ID và Secret
async function generateViaShopeeOpenApi(originUrl: string, appId: string, appSecret: string, subId?: string): Promise<string | null> {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const query = `mutation {
      generateShortLink(input: {
        originUrl: "${originUrl}",
        subIds: ["${subId || 'doca'}"]
      }) {
        shortLink
      }
    }`;

    const payload = JSON.stringify({ query });
    const signBase = `${appId}${timestamp}${payload}${appSecret}`;
    const signature = crypto.createHash('sha256').update(signBase).digest('hex');

    const res = await fetch('https://open-api.affiliate.shopee.vn/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
      },
      body: payload
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.data?.generateShortLink?.shortLink) {
        return data.data.generateShortLink.shortLink;
      }
    }
  } catch (err) {
    console.warn('Shopee Open API error:', err);
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, affiliateId, subId, appId, appSecret } = body;

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Vui lòng cung cấp đường dẫn Shopee hợp lệ' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let targetUrl = url.trim();

    // 1. Kiểm tra domain Shopee
    const isShopeeDomain = /shopee\.vn|shp\.ee|shope\.ee/i.test(targetUrl);
    if (!isShopeeDomain) {
      return new Response(JSON.stringify({ error: 'Đường dẫn không thuộc hệ thống Shopee (shopee.vn, s.shopee.vn, shp.ee)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Resolve link rút gọn Shopee nếu cần
    if (/shp\.ee|shope\.ee|s\.shopee\.vn/i.test(targetUrl)) {
      try {
        const redirectRes = await fetch(targetUrl, {
          method: 'HEAD',
          redirect: 'manual'
        });
        const locationHeader = redirectRes.headers.get('location');
        if (locationHeader) {
          targetUrl = locationHeader;
        } else {
          const getRes = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
            }
          });
          if (getRes.url && getRes.url !== targetUrl) {
            targetUrl = getRes.url;
          }
        }
      } catch (err: any) {
        console.warn('Shopee redirect resolve warning:', err?.message);
      }
    }

    // 3. Trích xuất Shop ID, Item ID
    const { shopId, itemId, slug } = extractShopAndItemId(targetUrl);

    // 4. Lấy thông tin Metadata (Tiêu đề & Ảnh)
    let productTitle = '';
    let productImage = '';

    const cleanShopeeUrl = shopId && itemId 
      ? `https://shopee.vn/product/${shopId}/${itemId}` 
      : targetUrl.split('?')[0];

    // Lớp 1: Cào trực tiếp User-Agent Facebook Bot
    try {
      const metaRes = await fetch(cleanShopeeUrl, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.7,en;q=0.3'
        }
      });
      if (metaRes.ok) {
        const html = await metaRes.text();
        const meta = extractMeta(html);
        productTitle = meta.title;
        productImage = meta.image;
      }
    } catch {
      // Ignore meta fetch error
    }

    // Fallback thông tin nếu cào bị chặn
    if (!productTitle) {
      productTitle = getFallbackTitleFromUrl(targetUrl);
    }
    if (!productImage) {
      productImage = 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=300';
    }

    // 5. Sinh Link Shopee Affiliate
    const targetAffiliateId = (affiliateId || process.env.PUBLIC_SHOPEE_AFFILIATE_ID || '17342530259').trim();
    const targetSubId = (subId || 'doca_product').trim();
    const targetAppId = (appId || process.env.SHOPEE_APP_ID || '').trim();
    const targetAppSecret = (appSecret || process.env.SHOPEE_APP_SECRET || '').trim();

    let affiliateUrl = '';
    let isShortLink = false;

    // Chế độ 1: Thử gọi Shopee Open API nếu có App ID
    if (targetAppId && targetAppSecret) {
      const shortLink = await generateViaShopeeOpenApi(targetUrl, targetAppId, targetAppSecret, targetSubId);
      if (shortLink) {
        affiliateUrl = shortLink;
        isShortLink = true;
      }
    }

    // Chế độ 2: Universal Tracking Link Builder
    if (!affiliateUrl) {
      const utmParams = new URLSearchParams({
        utm_source: `an_${targetAffiliateId}`,
        utm_medium: 'affiliates',
        utm_campaign: targetSubId,
        aff_sub: targetSubId,
        af_siteid: `an_${targetAffiliateId}`
      });

      if (shopId && itemId) {
        const slugPrefix = slug ? `${slug}-i` : 'product';
        affiliateUrl = `https://shopee.vn/${slugPrefix}.${shopId}.${itemId}?${utmParams.toString()}`;
      } else {
        // Gắn query param vào URL sạch
        const urlObj = new URL(cleanShopeeUrl);
        utmParams.forEach((val, key) => urlObj.searchParams.set(key, val));
        affiliateUrl = urlObj.toString();
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        originalUrl: url,
        resolvedUrl: targetUrl,
        affiliateUrl,
        isShortLink,
        title: productTitle,
        image: productImage,
        shopId,
        itemId,
        affiliateId: targetAffiliateId,
        subId: targetSubId
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error: any) {
    console.error('Shopee convert error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Đã có lỗi xảy ra khi tạo link affiliate Shopee'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
