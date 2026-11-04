/** Lo que se ve abajo del mapa: la lección, la pregunta, el resultado y el cierre. */
import type { DirectionQuestion, Option, Question } from '../../engine/quiz';
import type { LessonSlide } from '../../engine/quiz/lessons';

export const primaryButton =
  'min-h-14 w-full rounded-2xl bg-brand px-5 text-lg font-bold text-on-brand active:opacity-80';
const optionButton =
  'flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 py-2 text-left font-semibold ring-1 ring-line active:bg-page';

function ArrowIcon({ bearing }: { bearing: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7 shrink-0 text-brand"
      style={{ transform: `rotate(${bearing}deg)` }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20V4M5 11l7-7 7 7" />
    </svg>
  );
}

function BothWaysIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7 shrink-0 text-brand"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 20V4M3 9l5-5 5 5M16 4v16M11 15l5 5 5-5" />
    </svg>
  );
}

function OptionText({ option }: { option: Option }) {
  return (
    <span className="min-w-0">
      <span className="block">{option.label}</span>
      {option.detail && (
        <span className="block text-sm font-normal text-muted">{option.detail}</span>
      )}
    </span>
  );
}

function directionIcon(question: DirectionQuestion, option: string) {
  const arrow = question.arrows.find((a) => a.option === option);
  return arrow ? <ArrowIcon bearing={arrow.bearing} /> : <BothWaysIcon />;
}

interface QuestionPanelProps {
  question: Question;
  notice: string | undefined;
  onChoice: (option: string) => void;
}

export function QuestionPanel({ question, notice, onChoice }: QuestionPanelProps) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold">{question.prompt}</h1>
      {(question.kind === 'choice' || question.kind === 'direction') && (
        <ul className="space-y-2">
          {question.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={optionButton}
                onClick={() => {
                  onChoice(option.id);
                }}
              >
                {question.kind === 'direction' && directionIcon(question, option.id)}
                <OptionText option={option} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(question.kind === 'tap-street' || question.kind === 'tap-place') && (
        <p className="text-muted">
          {question.kind === 'tap-street'
            ? 'Tocá la calle en el mapa.'
            : 'Tocá el lugar en el mapa.'}
        </p>
      )}
      {notice && (
        <p role="status" className="font-medium text-warn">
          {notice}
        </p>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

interface FeedbackPanelProps {
  correct: boolean;
  /** Qué tocó, si se equivocó de calle. */
  detail: string | undefined;
  explanation: string;
  onNext: () => void;
}

export function FeedbackPanel({ correct, detail, explanation, onNext }: FeedbackPanelProps) {
  return (
    <div className="space-y-3">
      <div role="status" className="space-y-1">
        <p
          className={`flex items-center gap-2 text-xl font-bold ${correct ? 'text-ok' : 'text-bad'}`}
        >
          {correct ? <CheckIcon /> : <CrossIcon />}
          {correct ? '¡Bien!' : 'No era esa'}
        </p>
        {detail && <p className="text-muted">{detail}</p>}
        <p className="text-lg">{explanation}</p>
      </div>
      <button type="button" className={primaryButton} onClick={onNext}>
        Seguir
      </button>
    </div>
  );
}

interface LessonPanelProps {
  slide: LessonSlide;
  /** "Calle nueva", "Barrios", etc. */
  kicker: string;
  position: string | undefined;
  onNext: () => void;
}

export function LessonPanel({ slide, kicker, position, onNext }: LessonPanelProps) {
  return (
    <div className="flex max-h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 space-y-2 overflow-y-auto">
        <div>
          <p className="text-sm font-semibold text-brand">
            {kicker}
            {position && ` · ${position}`}
          </p>
          <h1 className="text-2xl font-bold">{slide.title}</h1>
        </div>
        <ul className="space-y-1">
          {slide.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <button type="button" className={`shrink-0 ${primaryButton}`} onClick={onNext}>
        Seguir
      </button>
    </div>
  );
}

interface SummaryPanelProps {
  answered: number;
  correct: number;
  lessons: number;
  missed: readonly string[];
  /** Cuántas tarjetas faltan todavía hoy. */
  pending: number;
  onMore: () => void;
  onHome: () => void;
}

export function SummaryPanel({
  answered,
  correct,
  lessons,
  missed,
  pending,
  onMore,
  onHome,
}: SummaryPanelProps) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-6 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-3xl font-bold">¡Listo por ahora!</h1>
        <p className="mt-2 text-lg text-muted">
          {answered === 0
            ? 'Hoy aprendiste algo nuevo.'
            : `Acertaste ${correct} de ${answered} preguntas.`}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <dt className="text-sm text-muted">Lecciones</dt>
          <dd className="text-3xl font-bold">{lessons}</dd>
        </div>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <dt className="text-sm text-muted">Vuelven mañana</dt>
          <dd className="text-3xl font-bold">{missed.length}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        {pending > 0 && (
          <button type="button" className={primaryButton} onClick={onMore}>
            Seguir: faltan {pending}
          </button>
        )}
        <button
          type="button"
          className={
            pending > 0
              ? 'min-h-14 w-full rounded-2xl px-5 text-lg font-semibold ring-1 ring-line active:opacity-70'
              : primaryButton
          }
          onClick={onHome}
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
