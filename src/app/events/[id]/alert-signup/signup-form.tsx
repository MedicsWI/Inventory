"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

const TOPICS: { value: string; label: string; help: string }[] = [
  { value: "LOST_CHILD", label: "Lost child", help: "Sent only if a child is reported missing." },
  { value: "SEVERE_WEATHER", label: "Severe weather", help: "Storms, tornado warnings, heat." },
  { value: "ALL_HANDS", label: "All-hands", help: "Critical event-wide announcements." },
  { value: "GEAR_RETURN", label: "Gear return", help: "Reminders when gear is past due." },
];

export function SignupForm({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [topics, setTopics] = useState<string[]>(["LOST_CHILD"]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleTopic(t: string) {
    setTopics((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function submit() {
    setError(null);
    if (!name.trim() || !phone.trim() || topics.length === 0 || !consent) {
      setError("Please fill out the required fields and check the consent box.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/alert-subscribers/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name, phone, department, topics, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Try again.");
      } else {
        setDone(data.message ?? "You're signed up.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border-2 border-primary bg-primary/5 p-6 text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
        <h2 className="text-xl font-bold">You&apos;re signed up</h2>
        <p className="text-sm">{done}</p>
        <p className="text-xs text-muted-foreground">
          Subscription ends when {eventName} ends. Reply STOP at any time to opt out.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold mb-1">Your name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Jane Doe"
          className="w-full h-12 text-base rounded-md border border-input bg-background px-3"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Mobile phone *</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          placeholder="(920) 555-1234"
          inputMode="tel"
          className="w-full h-12 text-base rounded-md border border-input bg-background px-3"
        />
        <div className="text-xs text-muted-foreground mt-1">
          US number. We&apos;ll send a confirmation text right away.
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Department</label>
        <input
          type="text"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="Parking · Stage crew · Info booth · etc."
          className="w-full h-12 text-base rounded-md border border-input bg-background px-3"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-semibold mb-2">Send me alerts for *</legend>
        {TOPICS.map((t) => (
          <label
            key={t.value}
            className="flex items-start gap-3 rounded-md border border-input bg-background p-3 cursor-pointer hover:bg-accent"
          >
            <input
              type="checkbox"
              checked={topics.includes(t.value)}
              onChange={() => toggleTopic(t.value)}
              className="mt-1 h-5 w-5"
            />
            <div>
              <div className="font-medium">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.help}</div>
            </div>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-3 rounded-md border border-input bg-background p-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-5 w-5"
        />
        <span className="text-xs leading-relaxed">
          I agree to receive event-related SMS alerts from Medics Wisconsin for{" "}
          <strong>{eventName}</strong>. Message and data rates may apply. Reply STOP to cancel.
        </span>
      </label>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 text-destructive text-sm p-3">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full h-12 rounded-md bg-primary text-primary-foreground font-semibold text-base disabled:opacity-60"
      >
        {submitting ? "Signing you up…" : "Sign me up"}
      </button>
    </div>
  );
}
