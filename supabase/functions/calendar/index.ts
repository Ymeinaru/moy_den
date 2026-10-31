// Supabase Edge Function: отдаёт .ics-календарь с задачами на 60 дней вперёд.
// Добавляется в iPhone/Calendar один раз как «подписной календарь»:
// дальше система сама хранит события и будит по будильнику за 5 минут.
// Секретов не требует. Деплой с выключенным Verify JWT.

type Task = {
  id?: string;
  title?: string;
  start?: string;
  est?: number;
  done?: boolean;
  note?: string;
};

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const pad = (n: number) => String(n).padStart(2, "0");

function esc(text: unknown) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fold(line: string) {
  if (line.length <= 74) return line;
  let out = "";
  let rest = line;
  while (rest.length > 74) {
    out += rest.slice(0, 74) + "\r\n ";
    rest = rest.slice(74);
  }
  return out + rest;
}

function stamp(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

function localStamp(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T` +
    `${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

Deno.serve(async () => {
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12);
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60, 12);

  const response = await fetch(
    `${URL}/rest/v1/days?select=date,payload&order=date.asc&limit=400`,
    { headers }
  );

  if (!response.ok) {
    return new Response("calendar source unavailable", { status: 502 });
  }

  const rows = await response.json();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moy Den//Planner//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Мой день",
    "X-WR-CALDESC:Задачи из планировщика «Мой день»",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  const fromKey = ymd(from);
  const toKey = ymd(to);

  for (const row of rows as Array<{ date: string; payload: { tasks?: Task[] } }>) {
    if (!row.date || row.date < fromKey || row.date > toKey) continue;
    const tasks = row.payload?.tasks;
    if (!Array.isArray(tasks)) continue;

    for (const task of tasks) {
      if (!task || task.done || !task.start) continue;

      const [h, m] = String(task.start).split(":").map(Number);
      if (Number.isNaN(h)) continue;

      const [y, mo, d] = row.date.split("-").map(Number);
      const begin = new Date(y, mo - 1, d, h, m || 0, 0);
      const minutes = Number(task.est) > 0 ? Number(task.est) : 30;
      const end = new Date(begin.getTime() + minutes * 60000);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${esc(task.id || row.date + h + m)}@moy-den`);
      lines.push(`DTSTAMP:${stamp(new Date())}`);
      lines.push(`DTSTART:${localStamp(begin)}`);
      lines.push(`DTEND:${localStamp(end)}`);
      lines.push(`SUMMARY:${esc(task.title || "Задача")}`);
      if (task.note) lines.push(`DESCRIPTION:${esc(task.note)}`);
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-PT5M");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${esc(task.title || "Задача")}`);
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="moy-den.ics"',
      "Cache-Control": "no-store",
    },
  });
});
