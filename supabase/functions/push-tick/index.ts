// Supabase Edge Function: раз в минуту проверяет, не пора ли напомнить о задаче.
// Секреты: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:...).
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY платформа выдаёт сама.
//
// Версия 2: ничего не делает на этапе импорта, поэтому не падает с 500,
// а возвращает диагностику: чего не хватает или где именно сломалось.

type Task = { id?: string; title?: string; start?: string; done?: boolean };

function json(data: unknown) {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

function toMin(hhmm: string) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

function localParts(tz: string) {
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return { minutes: toMin(time), date };
}

Deno.serve(async () => {
  const env = {
    VAPID_PUBLIC: Deno.env.get("VAPID_PUBLIC") ?? "",
    VAPID_PRIVATE: Deno.env.get("VAPID_PRIVATE") ?? "",
    VAPID_SUBJECT: Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@example.com",
    URL: Deno.env.get("SUPABASE_URL") ?? "",
    KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };

  const missing = (["VAPID_PUBLIC", "VAPID_PRIVATE", "URL", "KEY"] as const)
    .filter((name) => !env[name]);

  if (missing.length) return json({ ok: false, stage: "env", missing });

  let webpush: {
    setVapidDetails: (subject: string, pub: string, priv: string) => void;
    sendNotification: (sub: unknown, payload: string, options: unknown) => Promise<unknown>;
  };

  try {
    const mod = await import("npm:web-push@3.6.7");
    webpush = (mod.default ?? mod) as typeof webpush;
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC, env.VAPID_PRIVATE);
  } catch (error) {
    return json({ ok: false, stage: "import", error: String(error) });
  }

  try {
    const headers = {
      apikey: env.KEY,
      Authorization: `Bearer ${env.KEY}`,
      "Content-Type": "application/json",
    };
    const base = env.URL.replace(/\/+$/, "");

    const subsResponse = await fetch(`${base}/rest/v1/push_subs?select=*`, { headers });
    if (!subsResponse.ok) {
      return json({ ok: false, stage: "subs", status: subsResponse.status, body: await subsResponse.text() });
    }
    const subs = await subsResponse.json();
    if (!Array.isArray(subs) || !subs.length) return json({ ok: true, sent: 0, subs: 0 });

    const daysResponse = await fetch(`${base}/rest/v1/days?select=date,payload`, { headers });
    if (!daysResponse.ok) {
      return json({ ok: false, stage: "days", status: daysResponse.status, body: await daysResponse.text() });
    }
    const rows = await daysResponse.json();

    const byDate: Record<string, { tasks?: Task[] }> = {};
    for (const row of rows as Array<{ date: string; payload: { tasks?: Task[] } }>) {
      byDate[row.date] = row.payload;
    }

    let sent = 0;
    const errors: string[] = [];

    for (const sub of subs) {
      const { minutes, date } = localParts(sub.tz || "Europe/Moscow");
      const payload = byDate[date];
      if (!payload || !Array.isArray(payload.tasks)) continue;

      for (const task of payload.tasks) {
        if (!task || task.done || !task.start) continue;
        const notifyAt = toMin(task.start) - Number(sub.lead_min || 0);
        if (minutes < notifyAt || minutes >= notifyAt + 1) continue;

        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: `Скоро: ${task.title}`,
              body: `Начало в ${task.start}`,
              tag: `den-${task.id}`,
              url: "./",
            }),
            { TTL: 300 }
          );
          sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          errors.push(`${status ?? "?"}: ${String(error)}`);
          if (status === 404 || status === 410) {
            await fetch(`${base}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
              method: "DELETE",
              headers,
            });
          }
        }
      }
    }

    return json({ ok: true, sent, subs: subs.length, errors: errors.slice(0, 5) });
  } catch (error) {
    return json({ ok: false, stage: "run", error: String(error) });
  }
});
