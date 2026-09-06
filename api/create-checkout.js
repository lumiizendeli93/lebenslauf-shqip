import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const consentTimestamp = typeof body.consent_timestamp === 'string' ? body.consent_timestamp.slice(0, 100) : '';
  const consentText = typeof body.consent_text === 'string' ? body.consent_text.slice(0, 450) : '';
  // Server-side enforcement: checkout must not start without the § 356 Abs. 5 BGB withdrawal-waiver consent.
  if (body.widerruf_consent !== true || !consentTimestamp || !consentText) {
    return res.status(400).json({ error: 'Zustimmung zum Widerrufsverzicht fehlt.' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const consentMeta = {
      widerruf_consent: 'true',
      consent_timestamp: consentTimestamp,
      consent_text: consentText,
      legal_version: 'agb-2026-09'
    };
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypal'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'payment',
      success_url: process.env.NEXT_PUBLIC_URL + '/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.NEXT_PUBLIC_URL + '/',
      invoice_creation: { enabled: true },
      payment_intent_data: { metadata: consentMeta },
      metadata: consentMeta,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}