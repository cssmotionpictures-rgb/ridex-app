import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { sendGmail } from "../../shared/gmailSend.ts";

// SEND FEEDBACK — stores a user's Ride X feedback and emails it straight to
// the owner's inbox so product decisions are made from real user input.
// Bounded and abuse-guarded: rating is a whole number 1-5, category comes
// from a fixed list, the message is 10-2000 characters, and one user can
// submit at most once per minute. The record is always stored; a failed
// email never loses the feedback.

const OWNER_INBOX = "cssmotionpictures@gmail.com";
const CATEGORIES = ["ride", "logistics", "crix", "movies", "music", "carwash", "equipment", "other"];
const COOLDOWN_MS = 60 * 1000; // one submission per minute per user

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Please log in to send feedback." }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const rating = Math.round(Number(body.rating) || 0);
    const category = String(body.category || "");
    const message = String(body.message || "").trim().slice(0, 2000);
    const contactEmail = String(body.contact_email || user.email || "").trim().slice(0, 120);

    if (!(rating >= 1 && rating <= 5)) {
      return Response.json({ error: "Please pick a rating from 1 to 5 stars." }, { status: 400 });
    }
    if (!CATEGORIES.includes(category)) {
      return Response.json({ error: "Please choose which part of Ride X your feedback is about." }, { status: 400 });
    }
    if (message.length < 10) {
      return Response.json({ error: "Please tell us a little more (at least 10 characters)." }, { status: 400 });
    }

    // Simple abuse guard — at most one submission per minute per user.
    const recent = await svc.entities.Feedback.filter({ created_by_id: user.id }, "-created_date", 1);
    const last = (recent || [])[0];
    if (last && Date.now() - new Date(last.created_date).getTime() < COOLDOWN_MS) {
      return Response.json({ error: "You just sent feedback — please wait a minute before sending another." }, { status: 429 });
    }

    const record = await base44.entities.Feedback.create({
      rating,
      category,
      message,
      contact_email: contactEmail,
      user_id: user.id,
      status: "new",
    });

    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const emailBody = [
      "New Ride X feedback",
      "",
      "Rating: " + stars + " (" + rating + "/5)",
      "About: " + category,
      "From: " + (user.full_name || user.email || user.id) + " <" + contactEmail + ">",
      "Sent: " + new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" }),
      "",
      "Feedback:",
      message,
      "",
      "-- Stored in the app under Feedback records (id " + record.id + ")",
    ].join("\n");

    let emailSent = true;
    try {
      await sendGmail(base44, OWNER_INBOX, "Ride X feedback — " + category + " (" + rating + "/5)", emailBody);
    } catch (e) {
      emailSent = false; // the feedback record is still stored — nothing is lost
    }

    return Response.json({ ok: true, id: record.id, email_sent: emailSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}