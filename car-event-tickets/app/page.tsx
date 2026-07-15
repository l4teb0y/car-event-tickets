'use client';

import { useEffect, useRef, useState } from 'react';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type R = {
  status?: string;
  ticket_number?: number;
  checked_in_at?: string;
  checked_in_count?: number;
  total?: number;
  error?: string;
};

export default function Page() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [status, setStatus] = useState('START CAMERA');
  const [result, setResult] = useState<R | null>(null);
  const [active, setActive] = useState(false);

  const [total, setTotal] = useState(200);
  const [inside, setInside] = useState(0);

  const scanner = useRef<any>(null);
  const busy = useRef(false);

  async function rpc(
    name: string,
    args: Record<string, unknown>
  ) {
    const r = await fetch(
      `${URL}/rest/v1/rpc/${name}`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
        },

        body: JSON.stringify(args),

        cache: 'no-store',
      }
    );

    if (!r.ok) {
      throw new Error(
        `RPC ${name} failed: ${r.status}`
      );
    }

    return r.json();
  }

  function applyStats(d: R) {
    if (typeof d.total === 'number') {
      setTotal(d.total);
    }

    if (typeof d.checked_in_count === 'number') {
      setInside(d.checked_in_count);
    }
  }

  async function refreshStats(
    currentPin = pin
  ) {
    const d: R = await rpc(
      'scanner_stats',
      {
        p_pin: currentPin,
      }
    );

    if (d.error === 'unauthorized') {
      throw new Error('unauthorized');
    }

    applyStats(d);
  }

  async function login(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setLoginError('');

    if (!pin.trim()) {
      setLoginError('ENTER STAFF PIN');

      navigator.vibrate?.([
        120,
        70,
        120,
      ]);

      return;
    }

    try {
      const d: R = await rpc(
        'staff_login',
        {
          p_pin: pin,
        }
      );

      if (
        d.status !== 'authenticated'
      ) {
        setLoginError(
          'INVALID STAFF PIN'
        );

        navigator.vibrate?.([
          120,
          70,
          120,
        ]);

        return;
      }

      await refreshStats(pin);

      setUnlocked(true);
    } catch {
      setLoginError(
        'CONNECTION ERROR'
      );
    }
  }

  async function pauseScanner() {
    try {
      await scanner.current?.pause(true);
    } catch {}
  }

  async function submit(
    rawToken: string
  ) {
    if (busy.current) {
      return;
    }

    busy.current = true;

    const token = rawToken.trim();

    setStatus('CHECKING...');
    setResult(null);

    /*
     * Reject malformed QR codes locally.
     *
     * Do NOT send invalid UUID strings
     * to PostgreSQL.
     */
    if (!UUID_RE.test(token)) {
      setResult({
        status: 'invalid',
      });

      setStatus(
        'INVALID TICKET'
      );

      navigator.vibrate?.([
        150,
        80,
        150,
      ]);

      await pauseScanner();

      busy.current = false;

      return;
    }

    try {
      const d: R = await rpc(
        'check_in_ticket',
        {
          p_token: token,
          p_pin: pin,
        }
      );

      setResult(d);

      applyStats(d);

      if (
        d.error === 'unauthorized'
      ) {
        setUnlocked(false);

        setPin('');

        setStatus(
          'STAFF LOGIN REQUIRED'
        );
      } else {
        setStatus(
          d.status === 'valid'
            ? 'ACCESS GRANTED'
            : d.status ===
                'already_used'
              ? 'ALREADY USED'
              : 'INVALID TICKET'
        );

        /*
         * Invalid UUID-shaped token.
         *
         * Refresh stats because the
         * check_in response does not
         * contain counters.
         */
        if (
          d.status === 'invalid'
        ) {
          await refreshStats();
        }
      }

      navigator.vibrate?.(
        d.status === 'valid'
          ? 120
          : [
              150,
              80,
              150,
            ]
      );

      await pauseScanner();
    } catch {
      setResult({
        status: 'error',
      });

      setStatus('SCAN ERROR');

      navigator.vibrate?.([
        150,
        80,
        150,
      ]);

      await pauseScanner();
    } finally {
      busy.current = false;
    }
  }

  async function start() {
    setResult(null);

    setStatus(
      'POINT CAMERA AT QR'
    );

    setActive(true);

    /*
     * Always load the real counters
     * from Supabase before scanning.
     */
    try {
      await refreshStats();
    } catch {}

    const {
      Html5Qrcode,
    } = await import(
      'html5-qrcode'
    );

    if (scanner.current) {
      try {
        await scanner.current.stop();
      } catch {}
    }

    scanner.current =
      new Html5Qrcode('reader');

    try {
      await scanner.current.start(
        {
          facingMode: 'environment',
        },

        {
          fps: 12,

          qrbox: {
            width: 260,
            height: 260,
          },
        },

        submit,

        () => {}
      );
    } catch {
      setStatus(
        'CAMERA PERMISSION REQUIRED'
      );
    }
  }

  async function next() {
    setResult(null);

    busy.current = false;

    /*
     * Get the real database counters
     * before scanning the next ticket.
     */
    try {
      await refreshStats();
    } catch {}

    try {
      await scanner.current?.resume();
    } catch {
      await start();
    }

    setStatus(
      'POINT CAMERA AT QR'
    );
  }

  useEffect(
    () => () => {
      scanner.current
        ?.stop?.()
        .catch(() => {});
    },

    []
  );

  if (!unlocked) {
    return (
      <main className="login">
        <form
          className="card"
          onSubmit={login}
        >
          <div className="eyebrow">
            CAR EVENT
          </div>

          <h1>
            STAFF ACCESS
          </h1>

          <p className="muted">
            Enter the scanner PIN.
          </p>

          <input
            className="pin"
            type="password"
            inputMode="numeric"
            maxLength={12}
            value={pin}
            onChange={(e) =>
              setPin(
                e.target.value
              )
            }
            placeholder="••••••"
            autoFocus
          />

          <button
            className="next"
            type="submit"
          >
            OPEN SCANNER
          </button>

          {loginError && (
            <p className="error">
              {loginError}
            </p>
          )}
        </form>
      </main>
    );
  }

  const good =
    status === 'ACCESS GRANTED';

  const bad = [
    'ALREADY USED',
    'INVALID TICKET',
    'STAFF LOGIN REQUIRED',
    'SCAN ERROR',
    'CAMERA PERMISSION REQUIRED',
  ].includes(status);

  return (
    <main className="page">
      <div className="eyebrow">
        CAR EVENT
      </div>

      <h1 className="title">
        TICKET SCANNER
      </h1>

      <p className="muted">
        Scan the QR code on the ticket
      </p>

      <section
        className={`camera ${
          good
            ? 'good'
            : bad
              ? 'bad'
              : ''
        }`}
      >
        {!active ? (
          <button
            className="primary"
            onClick={start}
          >
            OPEN CAMERA
          </button>
        ) : (
          <div
            id="reader"
            className="reader"
          />
        )}
      </section>

      <div
        className={`status ${
          good
            ? 'good'
            : bad
              ? 'bad'
              : ''
        }`}
      >
        <div className="status-title">
          {status}
        </div>

        {result?.ticket_number && (
          <div className="ticket">
            TICKET #
            {String(
              result.ticket_number
            ).padStart(3, '0')}
          </div>
        )}

        {status ===
          'ALREADY USED' &&
          result?.checked_in_at && (
            <div className="first">
              First scan:{' '}
              {new Date(
                result.checked_in_at
              ).toLocaleTimeString()}
            </div>
          )}
      </div>

      {result && (
        <button
          className="next"
          onClick={next}
        >
          SCAN NEXT TICKET
        </button>
      )}

      <div className="stats">
        <div className="stat">
          <span>TOTAL</span>

          <strong>
            {total}
          </strong>
        </div>

        <div className="stat">
          <span>IN</span>

          <strong>
            {inside}
          </strong>
        </div>

        <div className="stat">
          <span>LEFT</span>

          <strong>
            {Math.max(
              total - inside,
              0
            )}
          </strong>
        </div>
      </div>

      <footer className="credit">
        made by @m4rl3y
      </footer>
    </main>
  );
}