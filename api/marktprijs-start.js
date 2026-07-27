// api/marktprijs-start.js — Vercel Serverless Function
//
// Start een prijsopzoeking bij DataForSEO (Google Shopping data), voor België of Nederland.
// DataForSEO werkt met "taken": je start een taak (dit bestand), en haalt het
// resultaat later apart op (marktprijs-result.js) — het antwoord is niet meteen klaar.
//
// Vereist de environment variables DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD,
// ingesteld in Vercel (Project Settings > Environment Variables). Nooit in de
// broncode zetten — dit bestand draait enkel op de server, dus process.env is hier veilig.

module.exports = async function handler(req, res) {
  const query = (req.query.query || "").trim();
  const land = req.query.land === "nl" ? "nl" : "be"; // default: België

  if (!query) {
    return res.status(400).json({ error: "Parameter 'query' (artikelnaam) ontbreekt." });
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    return res.status(500).json({
      error: "DataForSEO-inloggegevens ontbreken op de server (environment variables DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD zijn niet ingesteld in Vercel).",
    });
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const location_code = land === "nl" ? 2528 : 2056; // Google Ads geo-codes: NL=2528, BE=2056

  try {
    const response = await fetch("https://api.dataforseo.com/v3/merchant/google/products/task_post", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          language_code: "nl",
          location_code,
          keyword: query,
        },
      ]),
    });

    const data = await response.json();
    const task = data.tasks && data.tasks[0];

    if (!task || task.status_code >= 40000) {
      return res.status(200).json({
        error: "Kon geen taak starten bij DataForSEO: " + (task ? task.status_message : "onbekende fout"),
        raw: data,
      });
    }

    return res.status(200).json({ task_id: task.id });
  } catch (err) {
    return res.status(500).json({ error: "Serverfout bij starten van de taak: " + err.message });
  }
};
