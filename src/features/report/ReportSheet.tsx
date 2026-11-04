import { useState } from 'react';
import { canCorrectDirection } from '../../engine/corrections';
import type { Direction, StreetRecord } from '../../engine/data';
import type { LngLat } from '../../engine/geo';
import type { AppData } from '../../lib/data';
import type { ReportKind } from '../../storage/db';
import { BottomSheet } from '../../ui/BottomSheet';
import { stretchHeights } from '../explore/describe';
import { correctDirection, correctName, directionOptions, saveNote } from './actions';

const KINDS: { kind: ReportKind; label: string }[] = [
  { kind: 'sentido', label: 'El sentido está mal' },
  { kind: 'nombre', label: 'El nombre está mal' },
  { kind: 'falta-calle', label: 'Falta una calle' },
  { kind: 'otro', label: 'Otra cosa' },
];

const fieldClass = 'mt-1 min-h-12 w-full rounded-xl bg-page px-3 text-base ring-1 ring-line';
const optionClass = 'flex min-h-12 items-center gap-3';

interface ReportSheetProps {
  data: AppData;
  street: StreetRecord;
  place: LngLat | undefined;
  /** El tramo más cercano al toque, si lo hay. */
  stretch?: string;
  onClose: () => void;
}

function trapWarning(traps: number): string {
  return traps === 1
    ? 'Ojo: con este cambio queda una cuadra sin salida. Revisalo si podés.'
    : `Ojo: con este cambio quedan ${String(traps)} cuadras sin salida. Revisalo si podés.`;
}

export function ReportSheet({ data, street, place, stretch, onClose }: ReportSheetProps) {
  const correctable = street.stretches.filter(canCorrectDirection);
  const [kind, setKind] = useState<ReportKind>('sentido');
  // El tramo tocado puede ser de calzadas separadas: esos no se corrigen por acá.
  const [stretchId, setStretchId] = useState(
    correctable.find((s) => s.id === stretch)?.id ?? correctable[0]?.id ?? '',
  );
  const [dir, setDir] = useState<Direction | undefined>();
  const [name, setName] = useState(street.name);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  const selected = correctable.find((s) => s.id === stretchId);
  const options = selected
    ? directionOptions(data.graph, street, selected, (code) => data.streetByCode.get(code)?.name)
    : [];
  const ready =
    kind === 'sentido'
      ? selected !== undefined && dir !== undefined
      : kind === 'nombre'
        ? name.trim() !== '' && name.trim() !== street.name
        : note.trim() !== '';

  const store = async (): Promise<string> => {
    const text = note.trim();
    if (kind === 'sentido' && selected && dir) {
      const traps = await correctDirection(data, {
        street: street.code,
        stretch: selected.id,
        dir,
        ...(text ? { note: text } : {}),
        ...(place ? { place } : {}),
      });
      return traps > 0 ? trapWarning(traps) : 'Listo: quedó corregido en tu celu.';
    }
    if (kind === 'nombre') {
      await correctName(data, street.code, name.trim(), text || undefined);
      return 'Listo: quedó corregido en tu celu.';
    }
    if (kind === 'falta-calle' || kind === 'otro') {
      await saveNote(data, kind, text, street.code, place);
    }
    return 'Listo: quedó guardado en tu celu.';
  };

  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      setDone(await store());
    } catch {
      setFailed(true);
    }
    setSaving(false);
  };

  if (done) {
    return (
      <BottomSheet title="Reporte guardado" onClose={onClose}>
        <p role="status">{done}</p>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title="Reportar un error"
      full
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={!ready || saving}
          className="min-h-12 flex-1 rounded-xl bg-brand px-4 font-semibold text-on-brand disabled:opacity-50"
          onClick={() => {
            void save();
          }}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      }
    >
      <p className="font-medium">{street.name}</p>
      {failed && (
        <p role="alert" className="mt-1 text-warn">
          No se pudo guardar. Probá de nuevo.
        </p>
      )}
      <fieldset className="mt-2">
        <legend className="font-semibold">¿Qué pasa?</legend>
        {KINDS.map((option) => (
          <label key={option.kind} className={optionClass}>
            <input
              type="radio"
              name="report-kind"
              className="size-6 accent-brand"
              checked={kind === option.kind}
              onChange={() => {
                setKind(option.kind);
              }}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {kind === 'sentido' && (
        <div className="mt-3">
          {correctable.length === 0 ? (
            <p className="text-muted">
              Esta calle tiene calzadas separadas: contalo en “Otra cosa”.
            </p>
          ) : (
            <>
              <label className="block font-semibold">
                Tramo
                <select
                  className={fieldClass}
                  value={stretchId}
                  onChange={(event) => {
                    setStretchId(event.target.value);
                    setDir(undefined);
                  }}
                >
                  {correctable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {stretchHeights(s)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="mt-3">
                <legend className="font-semibold">¿Cómo es en la calle?</legend>
                {options.map((option) => (
                  <label key={option.dir} className={optionClass}>
                    <input
                      type="radio"
                      name="report-direction"
                      className="size-6 accent-brand"
                      checked={dir === option.dir}
                      onChange={() => {
                        setDir(option.dir);
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </div>
      )}

      {kind === 'nombre' && (
        <label className="mt-3 block font-semibold">
          Nombre correcto
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
      )}

      <label className="mt-3 block font-semibold">
        {kind === 'falta-calle' || kind === 'otro' ? 'Contame qué viste' : 'Nota (opcional)'}
        <textarea
          rows={2}
          className={`${fieldClass} py-2`}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
    </BottomSheet>
  );
}
