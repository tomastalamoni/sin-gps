import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { createQuizContext, questionFor, streetOfOption, type Question } from '../../engine/quiz';
import { frameOfSegments, inArea, type QuizContext } from '../../engine/quiz/context';
import { lessonSlides, travelLine, type LessonSlide } from '../../engine/quiz/lessons';
import { isPlaceHit, minAnswerZoom, resolveTap } from '../../engine/quiz/tap';
import type { StudyCard } from '../../engine/srs/cards';
import type { Lesson } from '../../engine/srs/curriculum';
import { learnerOf } from '../../engine/srs/planner';
import type { SessionItem } from '../../engine/srs/session';
import { QuestionClock } from '../../lib/clock';
import { useData, type AppData } from '../../lib/data';
import { logError } from '../../lib/errors';
import { playResult } from '../../lib/feedback';
import { refreshStudy, useStudy, type StudyData } from '../../lib/study';
import { QuizMap, type MapScene, type MapTap } from '../../map/QuizMap';
import { noteLesson, saveAnswer, updateSettings } from '../../storage/progress';
import { FeedbackPanel, LessonPanel, QuestionPanel, SummaryPanel } from './panels';
import {
  clearSession,
  quizData,
  readSession,
  saveSession,
  startSession,
  todayPlan,
  type ActiveSession,
} from './session';

type View =
  | { kind: 'lesson'; lesson: Lesson; slides: LessonSlide[]; slide: number }
  | { kind: 'question'; item: SessionItem; question: Question; notice?: string }
  | {
      kind: 'feedback';
      item: SessionItem;
      question: Question;
      correct: boolean;
      detail?: string;
      /** La calle que tocó o eligió, si no era. */
      wrongStreet?: number;
    }
  | { kind: 'summary' };

const LESSON_KICKER: Record<Lesson['kind'], string> = {
  rumbos: 'Orientación',
  barrios: 'Barrios',
  hitos: 'Hitos',
  autopistas: 'Autopistas',
  vias: 'Vías del tren',
  calle: 'Calle nueva',
};

/** Una lección que acaba de presentar una calle primero pide ubicarla. */
const LOCATE_FIRST = 'name';

function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let active = true;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (active) lock = next;
        else await next.release();
      } catch {
        // Donde el navegador no lo permite, la pantalla se apaga sola y nada más.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}

/** El primer ítem que se puede mostrar desde `index`: lo que ya no tiene pregunta se saltea. */
function viewAt(
  ctx: QuizContext,
  session: ActiveSession,
  index: number,
  cards: ReadonlyMap<string, StudyCard>,
): { index: number; view: View } {
  for (let i = index; i < session.items.length; i++) {
    const item = session.items[i] as SessionItem;
    if (item.type === 'lesson') {
      const slides = lessonSlides(ctx, item.lesson);
      if (slides.length > 0) {
        return { index: i, view: { kind: 'lesson', lesson: item.lesson, slides, slide: 0 } };
      }
      continue;
    }
    const known = cards.get(item.card);
    const question = questionFor(
      ctx,
      item.card,
      session.seed + i,
      known ? known.lastPrompt : LOCATE_FIRST,
    );
    if (question) return { index: i, view: { kind: 'question', item, question } };
  }
  return { index: session.items.length, view: { kind: 'summary' } };
}

function streetSegments(ctx: QuizContext, code: number | undefined): number[] {
  const street = code === undefined ? undefined : ctx.streetByCode.get(code);
  return street ? street.segments.filter((t) => inArea(ctx.graph, t)) : [];
}

/** Lo que se ve en el mapa, según la vista. */
function sceneOf(ctx: QuizContext, view: View, index: number): MapScene | undefined {
  if (view.kind === 'summary') return undefined;
  if (view.kind === 'lesson') {
    const slide = view.slides[view.slide] as LessonSlide;
    return {
      id: `lesson-${index}-${view.slide}`,
      frame: slide.frame,
      highlight: slide.highlight,
      visibility: slide.visibility,
      ...(slide.flow ? { flow: slide.flow } : {}),
    };
  }
  const { question } = view;
  if (view.kind === 'question') {
    return {
      id: `question-${index}`,
      frame: question.frame,
      highlight: question.highlight,
      visibility: question.visibility,
      ...(question.kind === 'direction' ? { arrows: question.arrows } : {}),
      ...(question.interaction === 'tap'
        ? { minTapZoom: minAnswerZoom(question.frame[0][1]) }
        : {}),
    };
  }

  // Resultado: la respuesta correcta queda a la vista, con su nombre y su sentido.
  const base = { visibility: { ...question.visibility, hiddenArrows: [] } };
  if (question.kind === 'tap-street') {
    const good = streetSegments(ctx, question.street);
    const bad = streetSegments(ctx, view.wrongStreet);
    return {
      ...base,
      id: `result-${index}`,
      frame: frameOfSegments(ctx.graph, [...good, ...bad]),
      highlight: {},
      visibility: {
        ...base.visibility,
        streets: [...base.visibility.streets, question.street],
      },
      good: { segments: good },
      ...(bad.length > 0 ? { bad: { segments: bad } } : {}),
    };
  }
  if (question.kind === 'tap-place') {
    return {
      ...base,
      id: `result-${index}`,
      frame: question.frame,
      highlight: { point: question.point },
    };
  }
  const entry = question.kind === 'direction' ? ctx.stretchById.get(question.card) : undefined;
  const flow = entry && travelLine(ctx.graph, entry.stretch);
  const answer = question.kind === 'choice' ? streetOfOption(question.answer) : undefined;
  return {
    ...base,
    id: `question-${index}`,
    frame: question.frame,
    highlight: question.highlight,
    visibility: {
      ...base.visibility,
      streets:
        answer === undefined ? base.visibility.streets : [...base.visibility.streets, answer],
    },
    ...(flow ? { flow } : {}),
  };
}

interface RunnerProps {
  data: AppData;
  study: StudyData;
  initial: ActiveSession;
  /** Arranca otra sesión sin salir de la pantalla. */
  onRestart: (session: ActiveSession) => void;
}

function SessionRunner({ data, study, initial, onRestart }: RunnerProps) {
  const [, navigate] = useLocation();
  useWakeLock();

  const [cards, setCards] = useState(study.cards);
  // El índice de calles vecinas se arma una vez: lo que cambia con cada respuesta es lo que se sabe.
  const base = useMemo(
    () => createQuizContext(quizData(data), learnerOf(new Map(), [], new Map(), study.srs)),
    [data, study.srs],
  );
  const ctx = useMemo<QuizContext>(
    () => ({ ...base, learner: learnerOf(cards, data.streets, study.confusions, study.srs) }),
    [base, cards, data.streets, study.confusions, study.srs],
  );

  const [session, setSession] = useState(initial);
  const [{ view, index }, setPosition] = useState(() => viewAt(ctx, initial, initial.index, cards));
  const clock = useRef<QuestionClock | undefined>(undefined);
  const busy = useRef(false);
  useEffect(() => {
    const created = new QuestionClock();
    clock.current = created;
    return () => {
      created.dispose();
    };
  }, []);

  const scene = useMemo(() => sceneOf(ctx, view, index), [ctx, view, index]);

  const moveTo = useCallback(
    (next: number, nextSession: ActiveSession) => {
      const position = viewAt(ctx, nextSession, next, cards);
      const updated = { ...nextSession, index: position.index };
      setSession(updated);
      setPosition(position);
      saveSession(updated).catch((error: unknown) => logError(error, 'guardar sesión'));
    },
    [cards, ctx],
  );

  const onReady = useCallback((id: string) => {
    if (id.startsWith('question-')) clock.current?.start();
  }, []);

  /** Califica la respuesta y muestra el resultado. */
  const answer = useCallback(
    async (correct: boolean, wrongStreet: number | undefined, detail: string | undefined) => {
      if (view.kind !== 'question' || busy.current) return;
      busy.current = true;
      const elapsedMs = clock.current?.stop() ?? 0;
      const { item, question } = view;
      const target =
        question.kind === 'tap-street'
          ? question.street
          : question.kind === 'choice'
            ? streetOfOption(question.answer)
            : undefined;
      playResult(correct, study.settings);
      try {
        if (item.type === 'review') {
          const saved = await saveAnswer(study.srs, {
            card: item.card,
            mode: question.mode,
            seed: question.seed,
            interaction: question.interaction,
            correct,
            elapsedMs,
            now: new Date(),
            ...(target !== undefined && wrongStreet !== undefined
              ? { confused: [target, wrongStreet] as [number, number] }
              : {}),
          });
          setCards((known) => new Map(known).set(item.card, saved.card));
          const { stats } = session;
          setSession({
            ...session,
            stats: {
              ...stats,
              answered: stats.answered + 1,
              correct: stats.correct + (correct ? 1 : 0),
              missed: correct ? stats.missed : [...stats.missed, item.card],
            },
          });
        }
      } catch (error) {
        await logError(error, 'guardar respuesta');
      }
      busy.current = false;
      setPosition({
        index,
        view: {
          kind: 'feedback',
          item,
          question,
          correct,
          ...(detail ? { detail } : {}),
          ...(wrongStreet === undefined ? {} : { wrongStreet }),
        },
      });
    },
    [index, session, study, view],
  );

  const onChoice = useCallback(
    (option: string) => {
      if (view.kind !== 'question') return;
      const { question } = view;
      if (question.kind !== 'choice' && question.kind !== 'direction') return;
      void answer(option === question.answer, streetOfOption(option), undefined);
    },
    [answer, view],
  );

  const onTap = useCallback(
    (tap: MapTap) => {
      if (view.kind !== 'question') return;
      const { question } = view;
      if (question.kind === 'direction') {
        if (tap.arrow) onChoice(tap.arrow);
        return;
      }
      if (question.kind === 'choice') return;
      if (tap.zoomedIn) {
        setPosition({
          index,
          view: { ...view, notice: 'Ahora tocá de nuevo, bien sobre el lugar.' },
        });
        return;
      }
      if (question.kind === 'tap-place') {
        const hit = isPlaceHit(question, tap.lngLat);
        void answer(hit, undefined, undefined);
        return;
      }
      const result = resolveTap(tap.candidates);
      if (result.kind === 'none') {
        setPosition({ index, view: { ...view, notice: 'Tocá sobre una calle.' } });
      } else if (result.kind === 'again') {
        setPosition({ index, view: { ...view, notice: 'Quedó entre dos calles: tocá de nuevo.' } });
      } else if (result.street === question.street) {
        void answer(true, undefined, undefined);
      } else {
        const name = ctx.streetByCode.get(result.street)?.name;
        void answer(false, result.street, name ? `Tocaste ${name}.` : undefined);
      }
    },
    [answer, ctx, index, onChoice, view],
  );

  const finishLesson = useCallback(
    async (lesson: Lesson) => {
      const now = new Date();
      const stats = { ...session.stats, lessons: session.stats.lessons + 1 };
      const next = { ...session, stats };
      moveTo(index + 1, next);
      try {
        // Una lección sin tarjetas no gasta el cupo del día.
        if (lesson.cards.length > 0) await noteLesson(now);
        else await updateSettings({ seen: [...study.settings.seen, lesson.id] });
      } catch (error) {
        await logError(error, 'guardar lección');
      }
    },
    [index, moveTo, session, study.settings.seen],
  );

  const onNext = useCallback(() => {
    if (view.kind === 'lesson') {
      if (view.slide + 1 < view.slides.length) {
        setPosition({ index, view: { ...view, slide: view.slide + 1 } });
        return;
      }
      void finishLesson(view.lesson);
      return;
    }
    moveTo(index + 1, session);
  }, [finishLesson, index, moveTo, session, view]);

  const leave = useCallback(() => {
    void refreshStudy().then(() => {
      navigate('/');
    });
  }, [navigate]);

  const finish = useCallback(
    async (more: boolean) => {
      await clearSession();
      const updated = await refreshStudy();
      const next = more ? await startSession('short', data, updated, new Date()) : undefined;
      if (next) onRestart(next);
      else navigate('/');
    },
    [data, navigate, onRestart],
  );

  // Con el día al día, el cierre sabe qué falta de verdad.
  const finished = view.kind === 'summary';
  useEffect(() => {
    if (finished) void refreshStudy();
  }, [finished]);

  if (view.kind === 'summary' || !scene) {
    const plan = todayPlan(data, study, new Date());
    return (
      <SummaryPanel
        {...session.stats}
        pending={plan.due + plan.lessons}
        onMore={() => {
          void finish(true);
        }}
        onHome={() => {
          void finish(false);
        }}
      />
    );
  }

  const total = session.items.length;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 bg-surface pt-[env(safe-area-inset-top)] pr-1 pl-4">
        <div
          role="progressbar"
          aria-label="Avance de la sesión"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index}
          className="h-2 flex-1 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${(index / total) * 100}%` }}
          />
        </div>
        <button type="button" className="min-h-12 min-w-12 px-3 font-medium" onClick={leave}>
          Salir
        </button>
      </div>
      <QuizMap
        data={data}
        scene={scene}
        className="min-h-0 flex-1"
        onTap={onTap}
        onReady={onReady}
      />
      <section className="flex max-h-[60%] min-h-0 flex-col overflow-y-auto border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {view.kind === 'lesson' && (
          <LessonPanel
            slide={view.slides[view.slide] as LessonSlide}
            kicker={LESSON_KICKER[view.lesson.kind]}
            position={
              view.slides.length > 1 ? `${view.slide + 1} de ${view.slides.length}` : undefined
            }
            onNext={onNext}
          />
        )}
        {view.kind === 'question' && (
          <QuestionPanel question={view.question} notice={view.notice} onChoice={onChoice} />
        )}
        {view.kind === 'feedback' && (
          <FeedbackPanel
            correct={view.correct}
            detail={view.detail}
            explanation={view.question.explanation}
            onNext={onNext}
          />
        )}
      </section>
    </div>
  );
}

export function SessionScreen() {
  const data = useData();
  const study = useStudy();
  const [session, setSession] = useState<ActiveSession | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void readSession(new Date()).then((found) => {
      if (active) setSession(found ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  if (session === undefined) return null;
  if (session === null) return <Redirect to="/" replace />;
  return (
    <SessionRunner
      key={session.seed}
      data={data}
      study={study}
      initial={session}
      onRestart={setSession}
    />
  );
}
