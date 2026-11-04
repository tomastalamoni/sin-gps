import { useState } from 'react';
import { isAskableConfidence, type StreetRecord } from '../../engine/data';
import type { LngLat } from '../../engine/geo';
import { cardIds } from '../../engine/ids';
import type { AppData } from '../../lib/data';
import { isStandalone } from '../../lib/platform';
import { refreshStudy, useStudy } from '../../lib/study';
import { updateSettings } from '../../storage/progress';
import { BottomSheet } from '../../ui/BottomSheet';
import { ReportSheet } from '../report/ReportSheet';
import {
  directionText,
  nearestSegment,
  pointOfStreet,
  sentenceCase,
  stretchHeights,
  streetViewUrl,
  trustText,
} from '../../engine/describe';
import { useExplore, type Selection } from './store';

const actionClass =
  'flex min-h-12 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-center font-semibold text-on-brand active:opacity-80';

function StreetViewLink({ point }: { point: LngLat | undefined }) {
  if (!point) return null;
  return (
    <a className={actionClass} href={streetViewUrl(point)} target="_blank" rel="noreferrer">
      Ver en Street View
    </a>
  );
}

function barrioNames(street: StreetRecord, barrios: GeoJSON.FeatureCollection): string {
  const display = new Map(
    barrios.features.map((f) => {
      const { name, display: text } = f.properties as { name: string; display: string };
      return [name, text];
    }),
  );
  return street.barrios.map((b) => display.get(b) ?? b).join(', ');
}

function Numbering({ street }: { street: StreetRecord }) {
  const { numbering } = street;
  if (!numbering) return <p>No tiene alturas.</p>;
  const cross = numbering.startCrossNames.join(' y ');
  return (
    <p>
      Del {numbering.start} al {numbering.end}.{cross && ` Arranca en ${cross}.`}
    </p>
  );
}

function Stretches({ street, data }: { street: StreetRecord; data: AppData }) {
  return (
    <ul className="divide-y divide-line">
      {street.stretches.map((stretch) => (
        <li key={stretch.id} className="py-2">
          <p className="font-medium">{stretchHeights(stretch)}</p>
          <p>{directionText(data.graph, data.barrios, stretch)}</p>
          <p
            className={`text-sm ${isAskableConfidence(stretch.confidence) ? 'text-muted' : 'text-warn'}`}
          >
            {trustText(stretch)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Crossings({ street, data }: { street: StreetRecord; data: AppData }) {
  if (street.crossings.length === 0) return null;
  return (
    <details className="mt-4">
      <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
        Transversales ({street.crossings.length})
      </summary>
      <ol className="divide-y divide-line">
        {street.crossings.map((crossing) => (
          <li key={`${crossing.street}-${crossing.node}`} className="flex justify-between py-2">
            <span>{data.streetByCode.get(crossing.street)?.name ?? crossing.street}</span>
            {crossing.height > 0 && <span className="text-muted">{crossing.height}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Adelanta la calle en la cola de lecciones. Solo si todavía no se estudió. */
function StudyNow({ street }: { street: StreetRecord }) {
  const study = useStudy();
  if (!street.askable || study.cards.has(cardIds.name(street.code))) return null;
  const { priority } = study.settings;
  const queued = priority.includes(street.code);
  return (
    <button
      type="button"
      disabled={queued}
      className="min-h-12 basis-full rounded-xl bg-brand px-4 font-semibold text-on-brand active:opacity-80 disabled:opacity-60"
      onClick={() => {
        void updateSettings({ priority: [street.code, ...priority] }).then(refreshStudy);
      }}
    >
      {queued ? 'Va primera en la cola' : 'Estudiar ahora'}
    </button>
  );
}

function StreetDetails({
  data,
  selection,
}: {
  data: AppData;
  selection: Extract<Selection, { kind: 'street' }>;
}) {
  const select = useExplore((state) => state.select);
  const [reporting, setReporting] = useState(false);
  const street = data.streetByCode.get(selection.street);
  if (!street) return null;
  const point = selection.point ?? pointOfStreet(data.graph, street.segments);
  if (reporting) {
    const near = point && nearestSegment(data.graph, point, street.segments);
    const stretch = street.stretches.find((s) => near !== undefined && s.segments.includes(near));
    return (
      <ReportSheet
        data={data}
        street={street}
        place={point}
        {...(stretch ? { stretch: stretch.id } : {})}
        onClose={() => {
          setReporting(false);
        }}
      />
    );
  }
  return (
    <BottomSheet
      title={selection.title ?? street.name}
      onClose={() => {
        select(undefined);
      }}
      footer={
        <>
          {isStandalone() && <StudyNow street={street} />}
          <StreetViewLink point={point} />
          <button
            type="button"
            className="min-h-12 flex-1 rounded-xl px-4 font-semibold ring-1 ring-line active:opacity-70"
            onClick={() => {
              setReporting(true);
            }}
          >
            Reportar un error
          </button>
        </>
      }
    >
      {selection.title && <p className="font-medium">{street.name}</p>}
      {street.previous && <p className="text-muted">Antes se llamaba {street.previous}.</p>}
      <p className="text-muted">
        {sentenceCase(street.type)} · {sentenceCase(street.hierarchy)}
      </p>

      <h3 className="mt-4 font-semibold">Sentido</h3>
      <Stretches street={street} data={data} />

      <h3 className="mt-4 font-semibold">Alturas</h3>
      <Numbering street={street} />

      <h3 className="mt-4 font-semibold">Barrios</h3>
      <p>{barrioNames(street, data.barrios)}</p>

      <Crossings street={street} data={data} />
    </BottomSheet>
  );
}

function CornerDetails({
  data,
  selection,
}: {
  data: AppData;
  selection: Extract<Selection, { kind: 'corner' }>;
}) {
  const select = useExplore((state) => state.select);
  return (
    <BottomSheet
      title={selection.title}
      onClose={() => {
        select(undefined);
      }}
      footer={<StreetViewLink point={selection.point} />}
    >
      <ul className="space-y-2">
        {selection.streets.map((code) => (
          <li key={code}>
            <button
              type="button"
              className="min-h-12 w-full rounded-xl px-3 text-left font-medium ring-1 ring-line"
              onClick={() => {
                select({ kind: 'street', street: code, point: selection.point });
              }}
            >
              {data.streetByCode.get(code)?.name}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

function LandmarkDetails({ selection }: { selection: Extract<Selection, { kind: 'landmark' }> }) {
  const select = useExplore((state) => state.select);
  return (
    <BottomSheet
      title={selection.title}
      onClose={() => {
        select(undefined);
      }}
      footer={<StreetViewLink point={selection.point} />}
    />
  );
}

export function SelectionSheet({ data }: { data: AppData }) {
  const selection = useExplore((state) => state.selection);
  if (selection?.kind === 'street') return <StreetDetails data={data} selection={selection} />;
  if (selection?.kind === 'corner') return <CornerDetails data={data} selection={selection} />;
  if (selection?.kind === 'landmark') return <LandmarkDetails selection={selection} />;
  return null;
}
