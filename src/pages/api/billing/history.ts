export const prerender = false;
import type { APIRoute } from 'astro';
import { getTransactionHistory } from '../../../billing/wallet-service';

export const GET: APIRoute = async ({ url }) => {
  try {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return new Response(JSON.stringify({ error: "Thiếu userId" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const history = await getTransactionHistory(userId);
    return new Response(JSON.stringify({ history }), {
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
