/** Primer uso (sección 7): cortito, y al final arranca la primera lección. */
import { useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useData } from '../../lib/data';
import { isStandalone } from '../../lib/platform';
import { refreshStudy, useStudy } from '../../lib/study';
import { updateSettings } from '../../storage/progress';
import { primaryButton } from '../session/panels';
import { startSession } from '../session/session';

const WELCOME = [
  {
    title: 'Aprendé a manejar sin GPS',
    text: 'Calles, sentidos y alturas del norte de CABA, en sesiones de unos minutos.',
  },
  {
    title: 'Todo es práctica',
    text: 'Cada pregunta se responde en el mapa. Lo que te cuesta vuelve antes y lo que sabés, después.',
  },
  {
    title: 'Sin internet ni cuentas',
    text: 'Tu progreso queda en este celu. No necesitás registrarte.',
  },
] as const;

const optionClass =
  'flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2 text-left font-semibold ring-1 ring-line active:bg-page';

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-5 py-[max(1.5rem,env(safe-area-inset-top))]">
      {children}
    </div>
  );
}

export function OnboardingScreen() {
  const data = useData();
  const study = useStudy();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [base, setBase] = useState<string | undefined>(undefined);

  if (!isStandalone() || study.settings.onboarded) return <Redirect to="/" replace />;

  const next = () => {
    setStep((s) => s + 1);
  };

  const finish = async (newPerDay: number) => {
    await updateSettings({ onboarded: true, newPerDay, ...(base ? { base } : {}) });
    const updated = await refreshStudy();
    await startSession('short', data, updated, new Date());
    navigate('/sesion');
  };

  const welcome = WELCOME[step];
  if (welcome) {
    return (
      <Page>
        <div>
          <h1 className="text-3xl font-bold">{welcome.title}</h1>
          <p className="mt-3 text-lg text-muted">{welcome.text}</p>
        </div>
        <button type="button" className={primaryButton} onClick={next}>
          Seguir
        </button>
      </Page>
    );
  }

  if (step === WELCOME.length) {
    return (
      <Page>
        <div>
          <h1 className="text-3xl font-bold">Antes de arrancar</h1>
          <p className="mt-3 text-lg text-muted">
            No uses la app mientras manejás. Respetá siempre la señalización real.
          </p>
        </div>
        <button type="button" className={primaryButton} onClick={next}>
          Entendido
        </button>
      </Page>
    );
  }

  if (step === WELCOME.length + 1) {
    return (
      <Page>
        <div>
          <h1 className="text-3xl font-bold">¿Cuál es tu barrio?</h1>
          <p className="mt-3 text-lg text-muted">Donde vivís o más te movés. Se empieza por ahí.</p>
        </div>
        <ul className="space-y-2">
          {data.barrioList.map((barrio) => (
            <li key={barrio.id}>
              <button
                type="button"
                className={optionClass}
                onClick={() => {
                  setBase(barrio.id);
                  next();
                }}
              >
                {barrio.display}
              </button>
            </li>
          ))}
        </ul>
      </Page>
    );
  }

  return (
    <Page>
      <div>
        <h1 className="text-3xl font-bold">¿Cuántas calles nuevas por día?</h1>
        <p className="mt-3 text-lg text-muted">Lo podés cambiar cuando quieras.</p>
      </div>
      <ul className="space-y-2">
        {data.load.options.map(({ newPerDay, minutes }) => (
          <li key={newPerDay}>
            <button
              type="button"
              className={optionClass}
              onClick={() => {
                void finish(newPerDay);
              }}
            >
              <span>{newPerDay} calles</span>
              <span className="font-normal text-muted">unos {Math.round(minutes)} min por día</span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
