export const prerender = false;
import type { APIRoute } from 'astro';
import { getWalletBalance } from '../../../billing/wallet-service';

export const GET: APIRoute = async ({ url }) => {
  try {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return new Response(JSON.stringify({ error: "Thiếu userId" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const balance = await getWalletBalance(userId);
    return new Response(JSON.stringify({ balance }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
