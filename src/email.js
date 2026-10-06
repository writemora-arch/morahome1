// Email queue: lead → queue → nodemailer (when SMTP configured) → 3 retries with backoff
const { db, now, getSetting } = require('./db');

function tpl(str, data) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (data[k] ?? ''));
}

function queueEmail(kind, to, subject, body, leadId = null) {
  if (!to) {
    if (leadId) db.prepare('UPDATE leads SET email_status=? WHERE id=?').run('no-recipient', leadId);
    return null;
  }
  const r = db.prepare('INSERT INTO email_jobs(lead_id,kind,to_addr,subject,body,status,next_run,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(leadId, kind, to, subject, body, 'pending', now(), now());
  return r.lastInsertRowid;
}

function queueLeadEmails(lead) {
  const email = getSetting('email', {});
  const templates = getSetting('emailTemplates', {});
  const data = {
    name: lead.name, phone: lead.phone, email: lead.email, business: lead.business, city: lead.city,
    product: lead.product_name, code: lead.product_code, quantity: lead.quantity ?? '', message: lead.message, source: lead.source_page
  };
  const routeKey = lead.type === 'catalogue' ? 'catalogue' : lead.type === 'whatsapp' ? 'whatsapp' : 'enquiry';
  const t = templates[routeKey] || templates.enquiry;
  const to = (email.routing && email.routing[routeKey]) || '';
  queueEmail(routeKey, to, tpl(t?.subject, data), tpl(t?.body, data), lead.id);
  if (email.autoReply && lead.email && lead.type !== 'whatsapp') {
    const ar = templates.autoreply;
    queueEmail('autoreply', lead.email, tpl(ar?.subject, data), tpl(ar?.body, data), lead.id);
  }
}

let transporter = null, transporterKey = '';
function getTransporter() {
  const e = getSetting('email', {});
  if (!e.smtpHost || !e.smtpUser || !e.smtpPass) return null;
  const key = [e.smtpHost, e.smtpPort, e.smtpUser].join('|');
  if (transporter && key === transporterKey) return transporter;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: e.smtpHost, port: parseInt(e.smtpPort, 10) || 587,
    secure: parseInt(e.smtpPort, 10) === 465,
    auth: { user: e.smtpUser, pass: e.smtpPass }
  });
  transporterKey = key;
  return transporter;
}

async function processQueue() {
  const jobs = db.prepare("SELECT * FROM email_jobs WHERE status='pending' AND next_run<=? ORDER BY id LIMIT 10").all(now());
  if (!jobs.length) return;
  const t = getTransporter();
  const e = getSetting('email', {});
  for (const j of jobs) {
    if (!t) {
      // no SMTP configured: keep visible as 'unconfigured' so admin sees it, retry once SMTP is added
      db.prepare("UPDATE email_jobs SET status='unconfigured', last_error='SMTP not configured', next_run=? WHERE id=? AND attempts=0").run(now() + 5 * 60e3, j.id);
      if (j.lead_id) db.prepare('UPDATE leads SET email_status=? WHERE id=?').run('unconfigured', j.lead_id);
      continue;
    }
    try {
      await t.sendMail({
        from: `"${e.fromName || 'MORA HOME'}" <${e.fromEmail || e.smtpUser}>`,
        to: j.to_addr, subject: j.subject, text: j.body,
        replyTo: e.replyTo || undefined
      });
      db.prepare("UPDATE email_jobs SET status='sent', attempts=attempts+1 WHERE id=?").run(j.id);
      if (j.lead_id) db.prepare('UPDATE leads SET email_status=? WHERE id=?').run('sent', j.lead_id);
    } catch (err) {
      const attempts = j.attempts + 1;
      if (attempts >= 3) {
        db.prepare("UPDATE email_jobs SET status='failed', attempts=?, last_error=? WHERE id=?").run(attempts, String(err.message || err).slice(0, 500), j.id);
        if (j.lead_id) db.prepare('UPDATE leads SET email_status=? WHERE id=?').run('failed', j.lead_id);
      } else {
        const backoff = attempts === 1 ? 60e3 : 5 * 60e3;
        db.prepare("UPDATE email_jobs SET attempts=?, last_error=?, next_run=? WHERE id=?").run(attempts, String(err.message || err).slice(0, 500), now() + backoff, j.id);
      }
    }
  }
}
setInterval(() => processQueue().catch(() => { }), 30e3).unref();

module.exports = { queueEmail, queueLeadEmails, processQueue, getTransporter };
