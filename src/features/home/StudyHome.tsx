/** Inicio de la app instalada: lo que toca hoy, a un toque (sección 7). */
import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { dayOf } from '../../engine/srs/days';
import type { SessionKind } from '../../engine/srs/session';
import { useData } from '../../lib/data';
import { useStudy } from '../../lib/study';
import { primaryButton } from '../session/panels';
import { readSession, startSession, todayPlan, type ActiveSession } from '../session/session';
import { VerifyLink } from '../verify/VerifyLink';

function minutesText(minutes: number): string {
  return minutes === 1 ? 'Cerca de 1 minuto' : `Cerca de ${minutes} minutos`;
}

function cardsText(due: number, lessons: number): string {
  const parts = [
    ...(due > 0 ? [due === 1 ? '1 repaso' : `${due} repasos`] : []),
    ...(lessons > 0 ? [lessons === 1 ? '1 lección nueva' : `${lessons} lecciones nuevas`] : []),
  ];
  return parts.join(' y ');
}

export function StudyHome() {
  const data = useData();
  const study = useStudy();
  const [, navigate] = useLocation();
  const [pending, setPending] = useState<ActiveSession | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const now = useMemo(() => new Date(), []);
  const plan = useMemo(() => todayPlan(data, study, now), [data, study, now]);

  useEffect(() => {
    let active = true;
    void readSession(new Date()).then((session) => {
      if (active) setPending(session);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!study.settings.onboarded) return <Redirect to="/bienvenida" replace />;

  const start = async (kind: SessionKind) => {
    if (starting) return;
    setStarting(true);
    const session = await startSession(kind, data, study, new Date());
    setStarting(false);
    if (session) navigate('/sesion');
  };

  const today = study.days.get(dayOf(now));
  const done = today?.reviews ?? 0;
  const total = done + plan.due;
  const nothingLeft = plan.due === 0 && plan.lessons === 0;

  return (
    <section aria-label="Repaso del día" className="mt-6 space-y-3">
      {pending ? (
        <button
          type="button"
          className={primaryButton}
          onClick={() => {
            navigate('/sesion');
          }}
        >
          Seguir donde estabas
        </button>
      ) : (
        <div className="rounded-3xl bg-surface p-5 ring-1 ring-line">
          <h2 className="text-2xl font-bold">
            {nothingLeft ? 'Por hoy, listo' : 'Repaso del día'}
          </h2>
          <p className="mt-1 text-muted">
            {nothingLeft
              ? 'Terminaste todo lo de hoy. Mañana hay más.'
              : `${cardsText(plan.due, plan.lessons)}. ${minutesText(plan.minutes)}.`}
          </p>
          {!nothingLeft && (
            <button
              type="button"
              className={`mt-4 ${primaryButton}`}
              onClick={() => {
                void start('short');
              }}
            >
              Empezar
            </button>
          )}
          {plan.due + plan.lessons > 1 && (
            <button
              type="button"
              className="mt-2 min-h-12 w-full rounded-2xl font-semibold text-brand active:opacity-70"
              onClick={() => {
                void start('long');
              }}
            >
              Hacer todo de una
            </button>
          )}
        </div>
      )}

      {total > 0 && (
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <p className="flex justify-between font-medium">
            <span>Meta de hoy</span>
            <span className="text-muted">
              {done} de {total}
            </span>
          </p>
          <div
            role="progressbar"
            aria-label="Meta de hoy"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="mt-2 h-2 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <VerifyLink />
    </section>
  );
}
