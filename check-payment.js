const crypto = require("crypto");

let cachedToken = null;
let cachedExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedExpiresAt - 60_000) return cachedToken;

  const clientId = process.env.LIVEPIX_CLIENT_ID;
  const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;
  const scope = process.env.LIVEPIX_SCOPE || "";

  if (!clientId || !clientSecret) throw new Error("Credenciais LivePix não configuradas.");

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

function decodeAndVerify(token) {
  const secret = process.env.GAME_PAYMENT_SECRET;
  if (!secret) throw new Error("GAME_PAYMENT_SECRET não configurado.");

  const raw = Buffer.from(token, "base64url").toString("utf8");
  const parts = raw.split(".");
  if (parts.length !== 4) throw new Error("Token de pagamento inválido.");

  const [reference, amountText, timestampText, signature] = parts;
  const payload = `${reference}.${amountText}.${timestampText}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Assinatura inválida.");
  }

  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) {
    throw new Error("Token de pagamento expirado.");
  }

  return {reference, amount: Number(amountText)};
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({error: "Método não permitido."});

  try {
    const {reference, amount} = decodeAndVerify(String(req.query.token || ""));
    if (!reference || !Number.isInteger(amount)) {
      return res.status(400).json({error: "Token inválido."});
    }

    const token = await getAccessToken();
    const url = new URL("https://api.livepix.gg/v2/payments");
    url.searchParams.set("reference", reference);
    url.searchParams.set("currency", "BRL");
    url.searchParams.set("limit", "10");

    const response = await fetch(url, {
      headers: {"Authorization": `Bearer ${token}`}
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status || 502).json({error: data.message || "Falha ao consultar pagamento."});
    }

    const payment = Array.isArray(data.data)
      ? data.data.find(p => p.reference === reference && p.currency === "BRL" && Number(p.amount) === amount)
      : null;

    return res.status(200).json({
      paid: Boolean(payment),
      reference
    });
  } catch (error) {
    return res.status(500).json({error: error.message || "Erro interno."});
  }
};
