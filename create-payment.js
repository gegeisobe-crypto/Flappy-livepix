const crypto = require("crypto");

let cachedToken = null;
let cachedExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedExpiresAt - 60_000) return cachedToken;

  const clientId = process.env.LIVEPIX_CLIENT_ID;
  const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;
  const scope = process.env.LIVEPIX_SCOPE || "";

  if (!clientId || !clientSecret) {
    throw new Error("LIVEPIX_CLIENT_ID e LIVEPIX_CLIENT_SECRET não configurados na Vercel.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });
  if (scope) body.set("scope", scope);

  const response = await fetch("https://oauth.livepix.gg/oauth2/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Falha na autenticação com a LivePix.");
  }

  cachedToken = data.access_token;
  cachedExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

function signPayment(reference, amount) {
  const secret = process.env.GAME_PAYMENT_SECRET;
  if (!secret) throw new Error("GAME_PAYMENT_SECRET não configurado na Vercel.");
  const payload = `${reference}.${amount}.${Date.now()}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({error: "Método não permitido."});

  try {
    const amount = Number(req.body?.amount);
    if (!Number.isInteger(amount) || amount < 10 || amount > 1000 || amount % 10 !== 0) {
      return res.status(400).json({error: "Valor deve estar entre R$10 e R$1.000, em múltiplos de R$10."});
    }

    const token = await getAccessToken();
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const response = await fetch("https://api.livepix.gg/v2/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: "BRL",
        redirectUrl: `${origin}/?livepix=return`
      })
    });

    const data = await response.json();
    if (!response.ok || !data.data?.reference || !data.data?.redirectUrl) {
      return res.status(response.status || 502).json({
        error: data.message || data.error || "A LivePix não criou o pagamento."
      });
    }

    const paymentToken = signPayment(data.data.reference, amount * 100);

    return res.status(201).json({
      reference: data.data.reference,
      redirectUrl: data.data.redirectUrl,
      paymentToken
    });
  } catch (error) {
    return res.status(500).json({error: error.message || "Erro interno."});
  }
};
