import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const packages = [
    {
      id: "coin_10k",
      name: "Gói Xu Tina",
      amount_vnd: 10000,
      coin_amount: 100,
      bonus_coin: 0,
      description: "Thích hợp nghe thử nhạc premium"
    },
    {
      id: "coin_50k",
      name: "Gói Xu Latte",
      amount_vnd: 50000,
      coin_amount: 500,
      bonus_coin: 50,
      description: "Đề xuất: Nhận thêm 50 xu thưởng"
    },
    {
      id: "coin_100k",
      name: "Gói Xu Muối",
      amount_vnd: 100000,
      coin_amount: 1000,
      bonus_coin: 150,
      description: "Tiết kiệm nhất: Nhận thêm 150 xu thưởng"
    }
  ];

  return new Response(JSON.stringify(packages), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
};
